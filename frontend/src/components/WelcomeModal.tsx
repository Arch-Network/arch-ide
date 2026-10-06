import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";

interface WelcomeModalProps {
  isOpen: boolean;
  onStart: () => void;
  onSkip: () => void;
}

export const WelcomeModal = ({ isOpen, onStart, onSkip }: WelcomeModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onSkip(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Welcome to Arch Network!</DialogTitle>
          <DialogDescription>
            A short checklist in the sidebar walks you through creating, building, deploying and invoking your
            first program, and ticks off each step as you do it. You can reopen it any time from the project
            menu (⋯) under Getting Started.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onSkip}>Not now</Button>
          <Button onClick={onStart}>Show checklist</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
