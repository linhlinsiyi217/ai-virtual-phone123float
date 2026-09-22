import type { QaGithubConfig } from "./qa-github";

// ── 工坊 GitHub 写入（P4）───────────────────────────
// 浏览器端经 Git Data API 提交多文件到分支。所有写操作都需要 PAT 且
// 由用户在 UI 确认后触发（确认模式），或用户显式开启全自动后由 agent 触发。

function apiBase(config: QaGithubConfig): string {
    return (config.apiBase || "https://api.github.com").replace(/\/+$/, "");
}

function writeHeaders(config: QaGithubConfig): Record<string, string> {
    if (!config.token) throw new Error("写操作需要 PAT。请在工坊「仓库」里填入有 Contents: Read and write 权限的 fine-grained PAT。");
    return {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
    };
}

async function ghJson<T>(config: QaGithubConfig, path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${apiBase(config)}${path}`, { ...init, headers: writeHeaders(config), signal });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`GitHub ${init.method || "GET"} ${path} → ${response.status}: ${body.slice(0, 200)}`);
    }
    return (await response.json()) as T;
}

export type QaCommitFile = { path: string; content: string };

export type QaCommitResult = {
    sha: string;
    branch: string;
    parentSha: string;
    htmlUrl: string;
    fileCount: number;
    /**
     * true = 本次并非新提交，而是核对后发现仓库里已经是提案内容（脏状态自愈）。
     * 此时 sha / htmlUrl 为空，UI 不得提供「撤销」（没有可回退的本地提交记录）。
     */
    reconciled?: boolean;
};

async function resolveBranch(config: QaGithubConfig, signal?: AbortSignal): Promise<string> {
    if (config.branch) return config.branch;
    const repo = await ghJson<{ default_branch: string }>(config, `/repos/${config.owner}/${config.repo}`, { method: "GET" }, signal);
    return repo.default_branch || "main";
}

async function getRef(config: QaGithubConfig, branch: string, signal?: AbortSignal): Promise<string> {
    const ref = await ghJson<{ object: { sha: string } }>(
        config,
        `/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
        { method: "GET" },
        signal,
    );
    return ref.object.sha;
}

function isMissingRefError(error: unknown): boolean {
    return error instanceof Error && /→ 404/.test(error.message);
}

export type QaBranchResult = { name: string; from: string; sha: string; created: boolean };

/** 从指定分支（默认仓库配置分支/默认分支）创建新分支。已存在时返回 created: false。 */
export async function createQaBranch(
    config: QaGithubConfig,
    input: { name: string; from?: string },
    signal?: AbortSignal,
): Promise<QaBranchResult> {
    const name = input.name.trim();
    if (!name) throw new Error("分支名不能为空。");
    const base = `/repos/${config.owner}/${config.repo}`;
    try {
        const existing = await getRef(config, name, signal);
        return { name, from: name, sha: existing, created: false };
    } catch (error) {
        if (!isMissingRefError(error)) throw error;
    }
    let from = input.from?.trim() || (await resolveBranch(config, signal));
    if (from === name) {
        // 配置分支本身就是要建的分支：改从仓库默认分支切出
        const repo = await ghJson<{ default_branch: string }>(config, base, { method: "GET" }, signal);
        from = repo.default_branch || "main";
    }
    const fromSha = await getRef(config, from, signal);
    await ghJson(
        config,
        `${base}/git/refs`,
        { method: "POST", body: JSON.stringify({ ref: `refs/heads/${name}`, sha: fromSha }) },
        signal,
    );
    return { name, from, sha: fromSha, created: true };
}

/**
 * 提交多个文件到指定分支（默认目标分支）。走 Git Data API：
 * 为每个文件建 blob → 建 tree（base_tree 保留其它文件）→ 建 commit → 更新 ref。
 * 目标分支不存在时自动从配置分支/默认分支创建。
 */
export async function commitQaFiles(
    config: QaGithubConfig,
    input: { message: string; files: QaCommitFile[]; deletes?: string[]; branch?: string },
    signal?: AbortSignal,
): Promise<QaCommitResult> {
    const deletes = (input.deletes ?? []).map((p) => p.replace(/^\/+/, "")).filter(Boolean);
    if (!input.files.length && !deletes.length) throw new Error("没有要提交的文件。");
    const branch = input.branch || (await resolveBranch(config, signal));
    const base = `/repos/${config.owner}/${config.repo}`;

    let parentSha: string;
    try {
        parentSha = await getRef(config, branch, signal);
    } catch (error) {
        if (!isMissingRefError(error) || !input.branch) throw error;
        // 指定的目标分支不存在：从配置分支/默认分支自动创建
        parentSha = (await createQaBranch(config, { name: branch }, signal)).sha;
    }
    const parentCommit = await ghJson<{ tree: { sha: string } }>(config, `${base}/git/commits/${parentSha}`, { method: "GET" }, signal);

    const treeItems: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
    for (const file of input.files) {
        const blob = await ghJson<{ sha: string }>(
            config,
            `${base}/git/blobs`,
            { method: "POST", body: JSON.stringify({ content: file.content, encoding: "utf-8" }) },
            signal,
        );
        treeItems.push({ path: file.path.replace(/^\/+/, ""), mode: "100644", type: "blob", sha: blob.sha });
    }
    // 删除：tree 条目 sha 为 null 即从 base_tree 中移除该文件
    for (const path of deletes) {
        treeItems.push({ path, mode: "100644", type: "blob", sha: null });
    }

    const tree = await ghJson<{ sha: string }>(
        config,
        `${base}/git/trees`,
        { method: "POST", body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeItems }) },
        signal,
    );

    const commit = await ghJson<{ sha: string; html_url?: string }>(
        config,
        `${base}/git/commits`,
        { method: "POST", body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [parentSha] }) },
        signal,
    );

    await ghJson(
        config,
        `${base}/git/refs/heads/${encodeURIComponent(branch)}`,
        { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) },
        signal,
    );

    return {
        sha: commit.sha,
        branch,
        parentSha,
        htmlUrl: commit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${commit.sha}`,
        fileCount: input.files.length + deletes.length,
    };
}

// ── 提交现状核对（防重复提交）────────────────────────
// 场景：Commit 其实已经成功推到 GitHub，但本地会话里的 pendingCommit 状态
// 因为历史 bug / 刷新 / 存储异常而丢了，UI 又显示「应用」。用户再点一次就会
// 产生内容完全相同的重复 Commit（并在分叉分支上触发 422 Not a fast forward）。
// 这里提供只读核对：提案内容是否已经等于仓库现状。

/** 只读 GitHub API 请求（无 PAT 时也能读公开仓库）。 */
async function ghReadJson<T>(config: QaGithubConfig, path: string, signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
    if (config.token) headers.Authorization = `Bearer ${config.token}`;
    const response = await fetch(`${apiBase(config)}${path}`, { method: "GET", headers, signal });
    if (response.status === 404) throw new Error(`GitHub GET ${path} → 404`);
    if (!response.ok) throw new Error(`GitHub GET ${path} → ${response.status}`);
    return (await response.json()) as T;
}

/** base64（GitHub contents API 返回，带换行）→ UTF-8 文本 */
function decodeBase64Utf8(base64: string): string {
    const binary = atob(base64.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

/** 行尾与首尾空行归一化：避免 CRLF / 尾换行差异把「已应用」误判成「未应用」 */
function normalizeForCompare(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

export type QaVerifyResult = {
    /** true = 提案内容已存在于仓库现状，绝不能再次提交 */
    applied: boolean;
    /** 尽力回溯到的对应提交 sha（按提交信息在分支近期历史里匹配；匹配不到则为空） */
    sha?: string;
    htmlUrl?: string;
    /** 分支当前 HEAD（诊断信息） */
    headSha?: string;
    /**
     * true = 核对过程未能完成（网络/权限/分支读取失败），applied 的 false 不可信。
     * 调用方据此显示「状态待确认」，而不是当作「确定未落地」放行重复提交。
     */
    inconclusive?: boolean;
    /** 判定依据说明，供 UI 展示与排障 */
    reason: string;
};

/**
 * 核对一份提交提案是否已经落地到目标分支。
 *
 * 判定逻辑（先内容、后信息）：
 *  1. 目标分支 HEAD 不存在 → 未应用；
 *  2. 提案里每个文件的目标内容与仓库现状逐一致（行尾归一化后比较）、
 *     且要删除的文件确实已不存在 → applied=true（内容级铁证）；
 *  3. 内容一致时，再按提交信息在分支近期提交里回溯对应的 sha，供 UI 显示
 *     「已应用 · a5a17d3」；
 *  4. 任何一步读取失败都不武断判定：返回 applied=false 但 reason 说明未能确认，
 *     由调用方按「状态待确认」处理（宁可不给应用入口，也不重复提交）。
 */
export async function verifyQaCommitApplied(
    config: QaGithubConfig,
    proposal: { files: QaCommitFile[]; deletes?: string[]; message?: string; branch?: string },
    signal?: AbortSignal,
): Promise<QaVerifyResult> {
    const base = `/repos/${config.owner}/${config.repo}`;
    const deletes = (proposal.deletes ?? []).map((p) => p.replace(/^\/+/, "")).filter(Boolean);
    // 注意：核对全程走只读 API（ghReadJson），没有 PAT 也能读公开仓库；
    // 不能用 getRef / resolveBranch——它们走写路径的 headers，缺 PAT 会直接抛错，
    // 会被误判成「分支不存在、提案未落地」，那就等于放行了一次重复提交。
    let branch = proposal.branch?.trim() || "";
    if (!branch) {
        try {
            const repo = await ghReadJson<{ default_branch?: string }>(config, base, signal);
            branch = repo.default_branch || "main";
        } catch (error) {
            return {
                applied: false,
                inconclusive: true,
                reason: `无法确定目标分支（${error instanceof Error ? error.message : String(error)}），未能核对仓库现状。`,
            };
        }
    }
    let headSha: string;
    try {
        const ref = await ghReadJson<{ object?: { sha?: string } }>(
            config,
            `${base}/git/ref/heads/${encodeURIComponent(branch)}`,
            signal,
        );
        headSha = ref.object?.sha ?? "";
        if (!headSha) throw new Error("分支引用缺少 sha");
    } catch (error) {
        if (error instanceof Error && /→ 404/.test(error.message)) {
            // 分支确实不存在 = 这份提案不可能已经落地（确定结论）
            return { applied: false, reason: `分支「${branch}」不存在，提案尚未落地。` };
        }
        return {
            applied: false,
            inconclusive: true,
            reason: `读取分支「${branch}」现状失败（${error instanceof Error ? error.message : String(error)}），未能核对。`,
        };
    }

    try {
        // 1) 要删除的文件必须都不存在
        for (const path of deletes) {
            try {
                await ghReadJson(config, `${base}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`, signal);
                return { applied: false, headSha, reason: `待删除文件 ${path} 仍存在于仓库中，提案未完全落地。` };
            } catch (error) {
                if (!(error instanceof Error) || !/→ 404/.test(error.message)) throw error;
                // 404 = 已删除，符合预期
            }
        }
        // 2) 每个文件的目标内容必须与仓库现状一致
        for (const file of proposal.files) {
            const path = file.path.replace(/^\/+/, "");
            let entry: { content?: string; encoding?: string; sha?: string; size?: number };
            try {
                entry = await ghReadJson(
                    config,
                    `${base}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
                    signal,
                );
            } catch (error) {
                if (error instanceof Error && /→ 404/.test(error.message)) {
                    return { applied: false, headSha, reason: `文件 ${path} 尚未存在于仓库，提案未落地。` };
                }
                throw error;
            }
            let current = "";
            if (entry.content) {
                current = decodeBase64Utf8(entry.content);
            } else if (entry.sha) {
                // 大文件（>1MB）contents API 不返回 content，回退到 blob API
                const blob = await ghReadJson<{ content?: string }>(config, `${base}/git/blobs/${entry.sha}`, signal);
                current = blob.content ? decodeBase64Utf8(blob.content) : "";
            }
            if (normalizeForCompare(current) !== normalizeForCompare(file.content)) {
                return { applied: false, headSha, reason: `文件 ${path} 的内容与提案不一致，提案未落地。` };
            }
        }
    } catch (error) {
        return {
            applied: false,
            inconclusive: true,
            headSha,
            reason: `核对仓库现状失败（${error instanceof Error ? error.message : String(error)}），未确认提案是否已落地。`,
        };
    }

    // 3) 内容已一致：按提交信息回溯对应 sha，供 UI 显示具体 commit
    let sha: string | undefined;
    let htmlUrl: string | undefined;
    const message = proposal.message?.trim();
    if (message) {
        try {
            const commits = await ghReadJson<Array<{ sha: string; html_url?: string; commit?: { message?: string } }>>(
                config,
                `${base}/commits?sha=${encodeURIComponent(branch)}&per_page=50`,
                signal,
            );
            const hit = commits.find((c) => (c.commit?.message ?? "").trim() === message);
            if (hit) {
                sha = hit.sha;
                htmlUrl = hit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${hit.sha}`;
            }
        } catch {
            // 回溯 sha 失败不影响「已应用」的结论
        }
    }
    return {
        applied: true,
        sha,
        htmlUrl,
        headSha,
        reason: sha
            ? `仓库现状已与提案内容一致（对应提交 ${sha.slice(0, 7)}）。`
            : "仓库现状已与提案内容一致，无需重复提交。",
    };
}

/** 删除分支（默认分支与配置分支受保护，拒绝删除）。 */
export async function deleteQaBranch(config: QaGithubConfig, name: string, signal?: AbortSignal): Promise<void> {
    const branch = name.trim();
    if (!branch) throw new Error("分支名不能为空。");
    const repo = await ghJson<{ default_branch: string }>(config, `/repos/${config.owner}/${config.repo}`, { method: "GET" }, signal);
    if (branch === repo.default_branch) throw new Error(`「${branch}」是默认分支，拒绝删除。`);
    if (config.branch && branch === config.branch) throw new Error(`「${branch}」是工坊当前配置的工作分支，先在仓库设置里切走再删。`);
    const response = await fetch(
        `${apiBase(config)}/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(branch)}`,
        { method: "DELETE", headers: writeHeaders(config), signal },
    );
    if (response.status === 404 || response.status === 422) throw new Error(`分支「${branch}」不存在。`);
    if (!response.ok) throw new Error(`删除分支失败：HTTP ${response.status}`);
}

export type QaPullResult = { number: number; htmlUrl: string };

/** 创建 Pull Request。 */
export async function createQaPullRequest(
    config: QaGithubConfig,
    input: { title: string; head: string; base?: string; body?: string },
    signal?: AbortSignal,
): Promise<QaPullResult> {
    const base = input.base?.trim() || (await resolveBranch(config, signal));
    const pull = await ghJson<{ number: number; html_url?: string }>(
        config,
        `/repos/${config.owner}/${config.repo}/pulls`,
        { method: "POST", body: JSON.stringify({ title: input.title, head: input.head, base, body: input.body || "" }) },
        signal,
    );
    return {
        number: pull.number,
        htmlUrl: pull.html_url || `https://github.com/${config.owner}/${config.repo}/pull/${pull.number}`,
    };
}

/** 合并 Pull Request。 */
export async function mergeQaPullRequest(
    config: QaGithubConfig,
    input: { number: number; method?: "merge" | "squash" | "rebase" },
    signal?: AbortSignal,
): Promise<{ merged: boolean; sha?: string; message: string }> {
    const result = await ghJson<{ merged?: boolean; sha?: string; message?: string }>(
        config,
        `/repos/${config.owner}/${config.repo}/pulls/${input.number}/merge`,
        { method: "PUT", body: JSON.stringify({ merge_method: input.method || "merge" }) },
        signal,
    );
    return { merged: Boolean(result.merged), sha: result.sha, message: result.message || "" };
}

/** 同步官方更新：等同网页上的 Sync fork（merge-upstream）。
 *  返回 conflict=true 表示与上游改动冲突，GitHub 拒绝自动合并（fork 原样未动）。 */
export async function syncQaForkWithUpstream(
    config: QaGithubConfig,
    branch: string,
    signal?: AbortSignal,
): Promise<{ ok: boolean; conflict: boolean; mergeType?: string; baseBranch?: string; message: string }> {
    const response = await fetch(
        `${apiBase(config)}/repos/${config.owner}/${config.repo}/merge-upstream`,
        { method: "POST", headers: writeHeaders(config), body: JSON.stringify({ branch }), signal },
    );
    const data = await response.json().catch(() => ({})) as { message?: string; merge_type?: string; base_branch?: string };
    if (response.ok) {
        return { ok: true, conflict: false, mergeType: data.merge_type, baseBranch: data.base_branch, message: data.message || "" };
    }
    if (response.status === 409) {
        return { ok: false, conflict: true, message: data.message || "merge conflict" };
    }
    return { ok: false, conflict: false, message: `GitHub ${response.status}: ${(data.message || "").slice(0, 200)}` };
}

/** 更新 issue：追加评论和/或开关状态。 */
export async function updateQaIssue(
    config: QaGithubConfig,
    input: { number: number; comment?: string; state?: "open" | "closed" },
    signal?: AbortSignal,
): Promise<void> {
    const base = `/repos/${config.owner}/${config.repo}/issues/${input.number}`;
    if (input.comment?.trim()) {
        await ghJson(config, `${base}/comments`, { method: "POST", body: JSON.stringify({ body: input.comment }) }, signal);
    }
    if (input.state) {
        await ghJson(config, base, { method: "PATCH", body: JSON.stringify({ state: input.state }) }, signal);
    }
}

export type QaIssueResult = { number: number; htmlUrl: string };

/** 创建 GitHub issue（反馈闭环用）。 */
export async function createQaIssue(
    config: QaGithubConfig,
    input: { title: string; body: string; labels?: string[] },
    signal?: AbortSignal,
): Promise<QaIssueResult> {
    const issue = await ghJson<{ number: number; html_url?: string }>(
        config,
        `/repos/${config.owner}/${config.repo}/issues`,
        { method: "POST", body: JSON.stringify({ title: input.title, body: input.body, labels: input.labels }) },
        signal,
    );
    return {
        number: issue.number,
        htmlUrl: issue.html_url || `https://github.com/${config.owner}/${config.repo}/issues/${issue.number}`,
    };
}

/**
 * 撤销一次提交：把分支强制回退到该提交的父提交。
 * 仅当分支 HEAD 仍是该提交时才安全（否则报错，避免覆盖后续提交）。
 */
export async function revertQaCommit(config: QaGithubConfig, commit: QaCommitResult, signal?: AbortSignal): Promise<void> {
    const base = `/repos/${config.owner}/${config.repo}`;
    const currentHead = await getRef(config, commit.branch, signal);
    if (currentHead !== commit.sha) {
        throw new Error("分支已有更新的提交，无法安全撤销这一次（避免覆盖后来的改动）。请到 GitHub 手动处理。");
    }
    await ghJson(
        config,
        `${base}/git/refs/heads/${encodeURIComponent(commit.branch)}`,
        { method: "PATCH", body: JSON.stringify({ sha: commit.parentSha, force: true }) },
        signal,
    );
}
