import { useRef, useState } from "react";
import { MoreHorizontal, Shield, UserMinus } from "lucide-react";
import type { Participant } from "@watchparty/shared";
import { Button, IconButton, Popover } from "./ui/index.js";

export function ParticipantManagement({
  person,
  disabled,
  assign,
  remove,
}: {
  person: Participant;
  disabled: boolean;
  assign: (id: string, role: "moderator" | "participant") => void;
  remove: (id: string) => void;
}) {
  const [open, setOpen] = useState<"menu" | "remove" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className="participant-management">
      <IconButton
        ref={trigger}
        disabled={disabled}
        aria-label={`Manage ${person.name}`}
        aria-expanded={!!open}
        onClick={() => setOpen(open ? null : "menu")}
      >
        <MoreHorizontal aria-hidden="true" />
      </IconButton>
      {open && (
        <Popover
          key={open}
          label={
            open === "remove"
              ? `Remove ${person.name}?`
              : `Manage ${person.name}`
          }
          triggerRef={trigger}
          className={`participant-menu ${open === "remove" ? "confirmation-dialog" : ""}`}
          onClose={() => setOpen(null)}
        >
          {open === "menu" ? (
            <>
              <Button
                onClick={() => {
                  assign(
                    person.id,
                    person.role === "moderator" ? "participant" : "moderator",
                  );
                  setOpen(null);
                }}
              >
                <Shield aria-hidden="true" />
                {person.role === "moderator"
                  ? "Make participant"
                  : "Make moderator"}
              </Button>
              <Button
                className="danger-action"
                onClick={() => setOpen("remove")}
              >
                <UserMinus aria-hidden="true" />
                Remove from room
              </Button>
            </>
          ) : (
            <>
              <h2>Remove {person.name}?</h2>
              <p>
                They will leave this room. They can join again with an invite.
              </p>
              <div className="confirmation-actions">
                <Button onClick={() => setOpen(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  className="danger-action"
                  onClick={() => {
                    remove(person.id);
                    setOpen(null);
                  }}
                >
                  Remove from room
                </Button>
              </div>
            </>
          )}
        </Popover>
      )}
    </div>
  );
}
