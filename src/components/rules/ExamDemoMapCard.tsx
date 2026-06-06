import { EXAM_DEMO_RULE_MAP } from "@/lib/presets/exam-map";

export function ExamDemoMapCard() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
            <th className="py-2 pr-3 font-medium">考核用例</th>
            <th className="py-2 pr-3 font-medium">格式</th>
            <th className="py-2 pr-3 font-medium">核心难点</th>
            <th className="py-2 font-medium">选用预设规则</th>
          </tr>
        </thead>
        <tbody>
          {EXAM_DEMO_RULE_MAP.map((row) => (
            <tr
              key={row.demo}
              className="border-b border-[var(--border)]/60 last:border-0"
            >
              <td className="py-2 pr-3">{row.demo}</td>
              <td className="py-2 pr-3 text-[var(--text-secondary)]">{row.format}</td>
              <td className="py-2 pr-3 text-[var(--text-secondary)]">{row.difficulty}</td>
              <td className="py-2">
                <span className="inline-block rounded-md bg-[var(--primary)]/10 px-2 py-0.5 text-[var(--primary)]">
                  {row.presetName}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        导入时手动选择规则，不做自动匹配。列映射不准时可用「新建规则」AI 生成后试解析微调。
      </p>
    </div>
  );
}
