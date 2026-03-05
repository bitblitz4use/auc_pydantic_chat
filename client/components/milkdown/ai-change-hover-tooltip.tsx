"use client";

import { useEffect, useState, useRef } from 'react';
import { Sparkles, Clock } from 'lucide-react';

interface AIChangeHoverTooltipProps {
  changeId: string;
  timestamp: number;
  model?: string;
  x: number;
  y: number;
}

export function AIChangeHoverTooltip({
  changeId,
  timestamp,
  model,
  x,
  y,
}: AIChangeHoverTooltipProps) {
  const [position, setPosition] = useState({ x, y });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Adjust position to keep tooltip in viewport
      let adjustedX = x;
      let adjustedY = y - rect.height - 8; // Position above cursor
      
      if (adjustedX + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      if (adjustedY < 0) {
        adjustedY = y + 20; // Position below cursor if no space above
      }
      
      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  const timeString = new Date(timestamp).toLocaleTimeString();

  return (
    <div
      ref={tooltipRef}
      className="ai-change-tooltip"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="tooltip-header">
        <Sparkles className="h-3 w-3 text-primary" />
        <span>AI Change</span>
      </div>
      <div className="tooltip-content">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{timeString}</span>
        </div>
        {model && (
          <div>Model: {model}</div>
        )}
      </div>
    </div>
  );
}
