import { useEffect, useRef } from 'react';
import type { DependencyGraph } from '@ghec/analysis';
export function DependencyCanvas({
  graph,
  selectedId,
  zoom,
}: {
  graph: DependencyGraph;
  selectedId: string | null;
  zoom: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgb(247, 247, 248)';
    context.fillRect(0, 0, width, height);
    const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
    const positions = new Map(
      nodes.map((node, index) => {
        const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
        return [
          node.id,
          {
            x:
              width / 2 +
              Math.cos(angle) * Math.min(width, height) * 0.35 * zoom,
            y:
              height / 2 +
              Math.sin(angle) * Math.min(width, height) * 0.35 * zoom,
          },
        ] as const;
      }),
    );
    context.lineWidth = 1;
    for (const edge of graph.edges) {
      const from = positions.get(edge.fromNodeId);
      const to = positions.get(edge.toNodeId);
      if (!from || !to) continue;
      context.strokeStyle =
        edge.confidence === 'low' ? 'rgb(217, 119, 6)' : 'rgb(100, 116, 139)';
      context.setLineDash(edge.confidence === 'low' ? [4, 3] : []);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
    context.setLineDash([]);
    for (const node of nodes) {
      const point = positions.get(node.id)!;
      context.beginPath();
      context.arc(
        point.x,
        point.y,
        node.id === selectedId ? 8 : 5,
        0,
        Math.PI * 2,
      );
      context.fillStyle = node.external
        ? 'rgb(217, 119, 6)'
        : node.id === selectedId
          ? 'rgb(124, 58, 237)'
          : 'rgb(37, 99, 235)';
      context.fill();
    }
  }, [graph, selectedId, zoom]);
  return (
    <canvas
      ref={ref}
      width={900}
      height={520}
      className="h-auto w-full rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-default)]"
      aria-hidden="true"
    />
  );
}
