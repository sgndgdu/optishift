import React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

export function DroppableCell({ id, children, disabled, className, onClick }: { id: string, children: React.ReactNode, disabled?: boolean, className?: string, onClick?: (e: any) => void }) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    disabled,
  });

  return (
    <td
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        className,
        isOver && !disabled ? "bg-indigo-50/50 ring-2 ring-inset ring-indigo-200" : ""
      )}
    >
      {children}
    </td>
  );
}

export function DraggableShift({ id, children, disabled }: { id: string, children: React.ReactNode, disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "relative z-50",
        isDragging ? "opacity-75 drop-shadow-md scale-105" : "",
        !disabled ? "cursor-grab active:cursor-grabbing" : ""
      )}
      onClick={e => e.stopPropagation()} // Prevent triggering cell click when starting drag
    >
      {children}
    </div>
  );
}
