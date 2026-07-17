import { ChevronDown } from "lucide-react";
import type { FC, PropsWithChildren, ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/web/components/ui/collapsible";

export const MetaConversationContent: FC<PropsWithChildren<{ title?: ReactNode }>> = ({
  children,
  title,
}) => {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded p-2 -mx-2 mb-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            {title ?? "Meta Information"}
          </h4>
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-background rounded border p-3 mt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};
