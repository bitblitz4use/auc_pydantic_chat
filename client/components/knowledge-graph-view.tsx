"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { RefreshCw } from "lucide-react";

function getAppTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function KnowledgeGraphView() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [theme, setTheme] = useState(getAppTheme());
  const [nodeLimit, setNodeLimit] = useState<number>(200);

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      const next = getAppTheme();
      if (next !== theme) {
        setTheme(next);
        iframeRef.current?.contentWindow?.postMessage({ type: "theme", value: next }, "*");
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [theme]);

  const onIframeLoad = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "theme", value: theme }, "*");
    win.postMessage({ type: "config", value: { maxNodes: nodeLimit } }, "*");
  };

  const src = useMemo(() => `/graph-force-dynamic.html?theme=${theme}`, [theme]);

  const applyLimit = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "config", value: { maxNodes: nodeLimit } },
      "*"
    );
  };

  const restart = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: "restart" }, "*");
  };

  return (
    <div className="h-full overflow-hidden px-4 pt-4 pb-4 flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Knowledge Graph</h2>
          <p className="text-sm text-muted-foreground">
            Dynamic force-directed graph rendered with Apache ECharts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-64">
            <InputGroup className="h-8">
              <InputGroupAddon className="text-xs text-muted-foreground">Node limit</InputGroupAddon>
              <InputGroupInput
                id="nodeLimit"
                type="number"
                min={1}
                step={1}
                value={nodeLimit}
                onChange={(e) => setNodeLimit(Math.max(1, Number(e.target.value) || 1))}
                className="w-20"
              />
              <InputGroupButton size="sm" variant="outline" onClick={applyLimit}>
                Apply
              </InputGroupButton>
            </InputGroup>
          </div>
          <Button variant="outline" size="sm" onClick={restart} className="h-8">
            <RefreshCw className="mr-2 h-4 w-4" />
            Restart
          </Button>
        </div>
      </div>

      <div className="h-full rounded-lg border border-border bg-card overflow-hidden">
        <iframe
          ref={iframeRef}
          src={src}
          className="h-full w-full border-0"
          title="ECharts Knowledge Graph"
          onLoad={onIframeLoad}
        />
      </div>
    </div>
  );
}

