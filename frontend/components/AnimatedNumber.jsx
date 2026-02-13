import { useEffect, useRef, useState } from "react";

export default function AnimatedNumber({
  value = 0,
  duration = 700,
  className = "",
  formatter = (num) => `${Math.round(num)}`,
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const start = performance.now();
    const from = fromRef.current;
    const to = Number(value) || 0;
    let raf = null;

    const tick = (time) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);

      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{formatter(display)}</span>;
}
