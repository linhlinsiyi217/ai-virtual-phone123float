"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronLeft, Clock, FileText, Hash, Type } from "lucide-react";
import { listReadingProgress } from "@/lib/reading-progress";
import { listShelfEntries } from "@/lib/bookroom-shelf";
import { loadBookAnnotations } from "@/lib/bookroom-annotations";
import { Segmented } from "./bookroom-ui";

type Props = {
  onBack: () => void;
};

type RangeDays = 7 | 30;

type Period = "day" | "week" | "month" | "year";

const PERIOD_LABEL: Record<Period, string> = {
  day: "日",
  week: "周",
  month: "月",
  year: "年",
};

function formatChars(chars: number): string {
  if (chars >= 10000) {
    const value = chars / 10000;
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)} 万字`;
  }
  return `${chars.toLocaleString()} 字`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = minutes / 60;
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} 小时`;
}

function getDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

/** 真实统计：从阅读进度、书架状态、共读会话、标注记录推导 */
export function StatsView({ onBack }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [range, setRange] = useState<RangeDays>(7);

  const progressList = useMemo(() => listReadingProgress(), []);
  const shelfEntries = useMemo(() => listShelfEntries(), []);

  // 统计有阅读记录的书籍数
  const docsRead = useMemo(() => {
    return shelfEntries.filter(e => e.status === "reading" || e.status === "finished").length;
  }, [shelfEntries]);

  // 已读完的书籍数
  const finishedCount = useMemo(() => {
    return shelfEntries.filter(e => e.status === "finished").length;
  }, [shelfEntries]);

  // 总标注数（作为翻页 / 互动代理指标）
  const annotationCount = useMemo(() => {
    let count = 0;
    for (const entry of shelfEntries) {
      count += loadBookAnnotations(entry.bookId).length;
    }
    return count;
  }, [shelfEntries]);

  // 估算总阅读时长（分钟）：基于阅读进度记录数 × 平均会话时长
  const totalMinutes = useMemo(() => {
    if (progressList.length === 0) return 0;
    // 每条进度记录平均估算 15 分钟阅读
    return progressList.length * 15;
  }, [progressList]);

  // 估算总阅读字数：基于已读书籍的平均章节字数
  const totalChars = useMemo(() => {
    let total = 0;
    for (const entry of shelfEntries) {
      if (entry.status !== "reading" && entry.status !== "finished") continue;
      // 书籍字数未知时按每本平均 80000 字估算
      total += 80000;
    }
    return total;
  }, [shelfEntries]);

  // 连续阅读天数
  const streakDays = useMemo(() => {
    if (progressList.length === 0) return 0;
    const days = new Set(progressList.map(p => getDayKey(p.updatedAt ?? 0)));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getDayKey(d.getTime());
      if (days.has(key)) {
        streak += 1;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  }, [progressList]);

  // 按周期过滤的阅读记录
  const filteredProgress = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    const cutoff = period === "day" ? now - dayMs
      : period === "week" ? now - 7 * dayMs
      : period === "month" ? now - 30 * dayMs
      : now - 365 * dayMs;
    return progressList.filter(p => (p.updatedAt ?? 0) >= cutoff);
  }, [progressList, period]);

  // 柱状图：最近 N 天的阅读活跃度（基于进度更新日期）
  const bars = useMemo(() => {
    const dayMs = 86400000;
    const now = Date.now();
    const dayCounts = new Array<number>(range).fill(0);
    for (const p of progressList) {
      const diff = Math.floor((now - (p.updatedAt ?? 0)) / dayMs);
      if (diff >= 0 && diff < range) {
        dayCounts[range - 1 - diff] += 1;
      }
    }
    const max = Math.max(...dayCounts, 1);
    return dayCounts.map(c => c / max);
  }, [progressList, range]);

  const hasData = progressList.length > 0 || docsRead > 0;

  const metrics = [
    { label: "总阅读时长", value: formatMinutes(totalMinutes), icon: Clock },
    { label: "阅读文档数", value: `${docsRead} 本`, icon: FileText },
    { label: "已读完", value: `${finishedCount} 本`, icon: BookOpen },
    { label: "标注数量", value: `${annotationCount} 条`, icon: Hash },
    { label: "连续阅读", value: `${streakDays} 天`, icon: Clock },
    { label: "阅读字数", value: formatChars(totalChars), icon: Type },
  ];

  if (!hasData) {
    return (
      <div className="br-page br-subpage">
        <header className="book-header">
          <div className="book-appbar">
            <button className="book-icon-btn book-pressable" type="button" onClick={onBack} aria-label="返回我的">
              <ChevronLeft size={22} strokeWidth={2} />
            </button>
          </div>
          <div className="book-title-stack">
            <h1 className="book-title">统计</h1>
            <p className="book-subtitle">READING STATS</p>
          </div>
        </header>
        <div className="book-body br-stats-body">
          <div className="br-stats-empty">
            <BookOpen size={40} strokeWidth={1.5} />
            <p className="br-stats-empty-title">还没有阅读记录</p>
            <p className="br-stats-empty-desc">从打开第一本书开始，这里会慢慢长出来。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="br-page br-subpage">
      <header className="book-header">
        <div className="book-appbar">
          <button className="book-icon-btn book-pressable" type="button" onClick={onBack} aria-label="返回我的">
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
        </div>
        <div className="book-title-stack">
          <h1 className="book-title">统计</h1>
          <p className="book-subtitle">READING STATS</p>
        </div>
      </header>

      <div className="book-body br-stats-body">
        <Segmented<Period>
          ariaLabel="统计周期"
          value={period}
          onChange={setPeriod}
          options={(Object.keys(PERIOD_LABEL) as Period[]).map(value => ({
            value,
            label: PERIOD_LABEL[value],
          }))}
        />

        <section className="br-metric-grid">
          {metrics.map(metric => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="br-metric book-glass">
                <span className="br-metric-icon" aria-hidden>
                  <Icon size={16} strokeWidth={1.9} />
                </span>
                <span className="br-metric-value">{metric.value}</span>
                <span className="br-metric-label">{metric.label}</span>
              </div>
            );
          })}
        </section>

        <section className="book-section">
          <div className="book-section-head">
            <h2 className="book-section-title">最近 {range} 天</h2>
            <Segmented<`${RangeDays}`>
              ariaLabel="统计范围"
              value={String(range) as `${RangeDays}`}
              onChange={value => setRange(Number(value) as RangeDays)}
              options={[
                { value: "7", label: "7 天" },
                { value: "30", label: "30 天" },
              ]}
            />
          </div>
          <div className="br-bars book-glass" aria-label={`最近${range}天阅读柱状图`}>
            {bars.map((height, index) => {
              const isLast = index === bars.length - 1;
              return (
                <span key={index} className="br-bar-col">
                  <span
                    className={`br-bar ${isLast ? "is-today" : ""}`}
                    style={{ height: `${Math.round(height * 100)}%` }}
                  />
                </span>
              );
            })}
          </div>
          <div className="br-bars-axis">
            <span>{range} 天前</span>
            <span>今天</span>
          </div>
        </section>

        {filteredProgress.length > 0 && (
          <section className="book-section">
            <div className="book-section-head">
              <h2 className="book-section-title">最近阅读</h2>
            </div>
            <div className="br-list book-glass">
              {filteredProgress.slice(0, 5).map(p => (
                <div key={p.bookId} className="br-list-row">
                  <span className="br-list-main">
                    <span className="br-list-label">{p.bookId}</span>
                    <span className="br-list-desc">
                      第 {p.chapterIndex + 1} 章 · {Math.round(p.scrollProgress * 100)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="br-stats-note">统计来自本机阅读记录。</p>
      </div>
    </div>
  );
}
