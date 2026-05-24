import React, { useEffect, useState } from 'react';

// Easing function for smooth counting
const easeOutQuart = (t) => 1 - (--t) * t * t * t;

export function CountUp({ end, duration = 2000, prefix = "", suffix = "" }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime = null;
    let animationFrame;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const progressRatio = Math.min(progress / duration, 1);
      
      const easedProgress = easeOutQuart(progressRatio);
      const currentCount = Math.floor(easedProgress * end);
      
      setCount(currentCount);

      if (progress < duration) {
        animationFrame = window.requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };

    animationFrame = window.requestAnimationFrame(step);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [end, duration]);

  // Format large numbers
  const formattedCount = new Intl.NumberFormat('en-US').format(count);

  return (
    <span>{prefix}{formattedCount}{suffix}</span>
  );
}
