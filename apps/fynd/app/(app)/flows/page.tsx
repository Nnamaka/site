"use client";

import { DEFAULT_FLOW, FLOW_PALETTE, type FlowEdge, type FlowNode } from "@nnamaka/fynd-shared";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Circle, Clock, FileText, Filter, Globe, Mail, RefreshCw, Save, Search, Send, Trash2, UserCheck, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFlow, useSaveFlow } from "@/lib/queries";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = { globe: Globe, search: Search, filter: Filter, "file-text": FileText, send: Send, "user-check": UserCheck, zap: Zap, clock: Clock, mail: Mail };

type StepData = FlowNode["data"];
type StepNode = Node<StepData, "step">;

function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  const Icon = ICONS[data.icon] ?? Circle;
  return (
    <div className={cn("flex h-[60px] w-[184px] items-center gap-2.5 rounded-[10px] border bg-card px-3 shadow-xs", selected && "border-ring ring-[3px] ring-ring/50")}>
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-[1.5px] !border-neutral-500 !bg-background" />
      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-medium">{data.title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{data.sub}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2.5 !border-[1.5px] !border-neutral-500 !bg-background" />
    </div>
  );
}

const nodeTypes = { step: StepNodeView };
const toRf = (n: FlowNode): StepNode => ({ id: n.id, type: "step", position: n.position, data: n.data });
const fromRf = (n: StepNode): FlowNode => ({ id: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data });
const edgeStyle = { stroke: "var(--neutral-300, #d4d4d4)", strokeWidth: 1.5 };

export default function FlowsPage() {
  const { data } = useFlow();
  const save = useSaveFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const load = (src: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
    setNodes(src.nodes.map(toRf));
    setEdges(src.edges.map((e) => ({ ...e, style: edgeStyle })));
  };
  useEffect(() => {
    if (data) load(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const selected = useMemo(() => nodes.filter((n) => n.selected).map((n) => n.id), [nodes]);

  if (!data) return <Skeleton className="h-[520px] rounded-xl" />;

  const add = (p: (typeof FLOW_PALETTE)[number]) => {
    const id = `n${Date.now().toString(36)}`;
    const k = nodes.length % 5;
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: "step", position: { x: 40 + k * 30, y: 20 + k * 24 }, data: p, selected: true }]);
  };
  const removeSelected = () => {
    setNodes((ns) => ns.filter((n) => !n.selected));
    setEdges((es) => es.filter((e) => !selected.includes(e.source) && !selected.includes(e.target)));
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Campaign flow</h2>
          <span className="text-[11px] text-muted-foreground">Drag steps to arrange. Drag from a step's right dot to another's left dot to connect. Backspace deletes.</span>
        </div>
        <div className="flex items-center gap-2">
          {selected.length ? (
            <Button variant="outline" size="sm" onClick={removeSelected}>
              <Trash2 />
              Remove step
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => load(DEFAULT_FLOW)}>
            <RefreshCw />
            Reset
          </Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ nodes: nodes.map(fromRf), edges: edges.map(({ id, source, target }) => ({ id, source, target })) })}>
            <Save />
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-medium text-neutral-600">Add step</span>
        {FLOW_PALETTE.map((p) => {
          const Icon = ICONS[p.icon] ?? Circle;
          return (
            <Button key={p.title} variant="outline" size="sm" onClick={() => add(p)}>
              <Icon />
              {p.title}
            </Button>
          );
        })}
      </div>

      <div className="h-[560px] overflow-hidden rounded-[10px] border bg-neutral-50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(c: Connection) => setEdges((es) => addEdge({ ...c, id: `e${Date.now().toString(36)}`, style: edgeStyle }, es))}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} color="#e5e5e5" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </>
  );
}
