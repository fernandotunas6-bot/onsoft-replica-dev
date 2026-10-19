"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const BackgroundBeams = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "absolute inset-0 z-0 h-full w-full overflow-hidden [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]",
        className
      )}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="blurMe">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="transparent" />
        <motion.circle
          cx="20%"
          cy="20%"
          r="25%"
          fill="rgba(214, 173, 108, 0.05)"
          animate={{
            cx: ["20%", "30%", "20%"],
            cy: ["20%", "40%", "20%"],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.circle
          cx="80%"
          cy="80%"
          r="30%"
          fill="rgba(85, 128, 112, 0.05)"
          animate={{
            cx: ["80%", "70%", "80%"],
            cy: ["80%", "60%", "80%"],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </svg>
      <div className="absolute inset-0 bg-grid-white/[0.02] [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
    </div>
  );
};
