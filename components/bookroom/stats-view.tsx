"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import {
  READING_STATS,
  STATS_PERIOD_LABEL,
  pseudoBars,
  type StatsPeriod,
} from "@/lib/bookroom-mock";
import { Segmented } from "./bookroom-ui";

type Props = {
  onBack: () => void;
};

type RangeDays = 7 | 30;

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

/**
 * 统计页（我的 → 统计）：总时长 / 文档数 / 翻页次数 / 阅读字数，
 * 日 / 周 / 月 / 年切换 + 最近 7 / 30 天柱状。本地演示数据，黑白灰版本。
 */
export function StatsView({ onBack }: Props) {
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const [range, setRange] = useState<RangeDays>(7);
  const snapshot = READING_STATS[period];
  const bars = pseudoBars(`stats-${period}-${range}`, range);

  const metrics = [
    { label: "总阅读时长", value: formatMinutes(snapshot.minutes) },
    { label: "阅读文档数", value: `${snapshot.docs} 本` },
    { label: "翻页次数", value: snapshot.flips.toLocaleString() },
    { label: "阅读字数", value: formatChars(snapshot.chars) },
  ];

  return (
    <div className="br-page br-subpage">
      <header className="book-header">
        <div className="book-appbar">
          <button
            className="book-icon-btn book-pressable"
            type="button"
            onClick={onBack}
            aria-label="返回我的"
          >
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
        </div>
        <div className="book-title-stack">
          <h1 className="book-title">统计</h1>
          <p className="book-subtitle">READING STATS</p>
        </div>
      </header>

      <div className="book-body br-stats-body">
        <Segmented<StatsPeriod>
          ariaLabel="统计周期"
          value={period}
          onChange={setPeriod}
          options={(Object.keys(STATS_PERIOD_LABEL) as StatsPeriod[]).map(value => ({
            value,
            label: STATS_PERIOD_LABEL[value],
          }))}
        />

        <section className="br-metric-grid">
          {metrics.map(metric => (
            <div key={metric.label} className="br-metric book-glass">
              <span className="br-metric-value">{metric.value}</span>
              <span className="br-metric-label">{metric.label}</span>
            </div>
          ))}
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

        <p className="br-stats-note">统计来自本机阅读记录，部分指标为演示数据。</p>
      </div>
    </div>
  );
}
