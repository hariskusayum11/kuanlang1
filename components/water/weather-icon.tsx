// ไอคอนสภาพอากาศจากรหัส WMO — SVG ล้วน ไม่มี hook (Server/Client ได้) · สีจาก Token
const SUN = "fill-sun-400";
const CLOUD = "fill-slate-200 stroke-slate-400";
const DARK_CLOUD = "fill-slate-400 stroke-slate-500";

function Sun({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <circle cx={cx} cy={cy} r={r} className={SUN} />;
}
function Moon({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <path d={`M${cx + r * 0.3} ${cy - r} a${r} ${r} 0 1 0 ${r * 0.7} ${r * 1.55} a${r * 0.8} ${r * 0.8} 0 0 1 ${-r * 0.7} ${-r * 1.55}Z`} className="fill-brand-400" />;
}
function Cloud({ dark = false }: { dark?: boolean }) {
  return <path d="M10 30 a7 7 0 0 1 1-14 a9 9 0 0 1 17-3 a7 7 0 0 1 9 7 a5 5 0 0 1 -1 10 Z" className={dark ? DARK_CLOUD : CLOUD} strokeWidth={1.5} />;
}

/** ประเภทไอคอนจากรหัส WMO */
export function weatherKind(code: number | null): "clear" | "partly" | "cloudy" | "fog" | "rain" | "storm" {
  if (code === null) return "cloudy";
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if (code >= 51) return "rain";
  return "cloudy";
}

export function WeatherIcon({ code, isDay = true, className = "h-8 w-8" }: { code: number | null; isDay?: boolean; className?: string }) {
  const kind = weatherKind(code);
  return (
    <svg viewBox="0 0 44 40" className={`${className} shrink-0`} aria-hidden>
      {kind === "clear" ? (
        isDay ? (
          <g>
            <Sun cx={22} cy={20} r={9} />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * Math.PI) / 4;
              return <line key={i} x1={22 + Math.cos(a) * 12} y1={20 + Math.sin(a) * 12} x2={22 + Math.cos(a) * 16} y2={20 + Math.sin(a) * 16} className="stroke-sun-500" strokeWidth={2} strokeLinecap="round" />;
            })}
          </g>
        ) : (
          <Moon cx={20} cy={20} r={10} />
        )
      ) : null}
      {kind === "partly" ? (
        <g>
          {isDay ? <Sun cx={14} cy={13} r={7} /> : <Moon cx={12} cy={12} r={7} />}
          <Cloud />
        </g>
      ) : null}
      {kind === "cloudy" || kind === "fog" ? (
        <g>
          <Cloud />
          {kind === "fog" ? [33, 37].map((y) => <line key={y} x1={9} x2={35} y1={y} y2={y} className="stroke-slate-400" strokeWidth={2} strokeLinecap="round" />) : null}
        </g>
      ) : null}
      {kind === "rain" || kind === "storm" ? (
        <g>
          <Cloud dark={kind === "storm"} />
          {kind === "storm" ? (
            <path d="M22 28 L18 35 H22 L19 40 L27 32 H23 L26 28 Z" className="fill-sun-500" />
          ) : (
            [14, 21, 28].map((x) => <line key={x} x1={x} y1={32} x2={x - 2} y2={38} className="stroke-brand-500" strokeWidth={2} strokeLinecap="round" />)
          )}
        </g>
      ) : null}
    </svg>
  );
}
