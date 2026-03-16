import React from "react";

export default function HowToWidget({ image, task }) {
  return (
    <div className="w-full h-full rounded-card overflow-hidden relative bg-card">
      {image && (
        <img src={image} alt={task} className="w-full h-full object-cover" />
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
        <p className="text-white text-sm font-semibold capitalize">{task}</p>
      </div>
    </div>
  );
}
