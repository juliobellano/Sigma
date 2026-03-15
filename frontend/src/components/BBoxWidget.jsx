import React from "react";
import { motion } from "framer-motion";

export default function BBoxWidget({ image, label }) {
  return (
    <div className="w-full h-full rounded-card overflow-hidden relative bg-black">
      {image && (
        <motion.img
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          src={image}
          alt={label || "Detected object"}
          className="w-full h-full object-cover"
        />
      )}
      {label && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2.5 text-white text-sm font-semibold text-center"
        >
          {label}
        </motion.div>
      )}
    </div>
  );
}
