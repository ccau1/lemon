import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api.ts";

type DocNode =
  | { type: "folder"; name: string; path: string; children: DocNode[] }
  | { type: "file"; name: string; path: string };

type DocsData = {
  tree: DocNode[];
  contents: Record<string, string>;
};

function findFirstFile(nodes: DocNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "file") return node.path;
    const child = findFirstFile(node.children);
    if (child) return child;
  }
  return null;
}

function Sidebar({
  nodes,
  selected,
  onSelect,
  level = 0,
}: {
  nodes: DocNode[];
  selected: string;
  onSelect: (path: string) => void;
  level?: number;
}) {
  return (
    <ul className={level === 0 ? "" : "ml-3 border-l border-gray-200 pl-2"}>
      {nodes.map((node) => (
        <li key={node.path} className="mt-1">
          {node.type === "folder" ? (
            <div>
              <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {node.name}
              </div>
              <Sidebar
                nodes={node.children}
                selected={selected}
                onSelect={onSelect}
                level={level + 1}
              />
            </div>
          ) : (
            <button
              onClick={() => onSelect(node.path)}
              className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                selected === node.path
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {node.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function DocsPage() {
  const { "*": splat } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery<DocsData>({
    queryKey: ["docs"],
    queryFn: api.getDocs,
  });

  const selectedPath = splat || "";
  const tree = data?.tree || [];
  const contents = data?.contents || {};

  const firstFile = useMemo(() => findFirstFile(tree), [tree]);

  useEffect(() => {
    if (!selectedPath && firstFile) {
      navigate(`/docs/${firstFile}`, { replace: true });
    }
  }, [selectedPath, firstFile, navigate]);

  const content = contents[selectedPath] || "";

  if (isLoading) {
    return <div className="text-gray-500">Loading docs...</div>;
  }

  return (
    <div className="flex h-full -m-6">
      <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto p-4">
        <div className="mb-2 px-2 text-sm font-bold text-gray-900">
          Documentation
        </div>
        <Sidebar
          nodes={tree}
          selected={selectedPath}
          onSelect={(p) => navigate(`/docs/${p}`)}
        />
      </aside>
      <main className="flex-1 overflow-y-auto p-6 markdown-body">
        {content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        ) : (
          <div className="text-gray-500">Select a document from the sidebar.</div>
        )}
      </main>
    </div>
  );
}
