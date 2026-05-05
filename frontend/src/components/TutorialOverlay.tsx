import React, { useEffect, useState } from 'react';
import { useTutorial } from '../context/TutorialContext';
import { Portal } from '@radix-ui/react-portal';
import { Button } from '@/components/ui/button';

interface IndicatorDotProps {
  top: number;
  left: number;
}

const IndicatorDot: React.FC<IndicatorDotProps> = ({ top, left }) => (
  <div
    aria-hidden="true"
    className="tutorial-indicator-dot pointer-events-none absolute h-4 w-4 rounded-full bg-brand"
    style={{
      top: `${top}px`,
      left: `${left}px`,
      transform: 'translate(-50%, -50%)',
      zIndex: 49,
      border: '2px solid hsl(var(--brand) / 0.3)',
      boxShadow: '0 0 12px hsl(var(--brand) / 0.7)',
    }}
  />
);

export const TutorialOverlay: React.FC = () => {
  const { isActive, currentStep, steps, nextStep, previousStep, skipTutorial } = useTutorial();
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState({ top: 0, left: 0, direction: 'down' });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setIsVisible(false);
      return;
    }

    const updatePosition = () => {
      const target = document.querySelector(steps[currentStep].target);

      if (!target) {
        setIsVisible(false);
        setPosition({ top: 20, left: 20 });
        return;
      }

      const rect = target.getBoundingClientRect();
      const placement = steps[currentStep].placement || 'bottom';

      // Calculate tooltip position relative to target
      const tooltipWidth = 300;
      const tooltipHeight = 150;
      const spacing = 20;

      let top, left, arrowDir;

      // Position tooltip based on placement but ensure it doesn't overlap the target
      switch (placement) {
        case 'bottom':
          top = rect.bottom + spacing;
          left = Math.max(
            20,
            rect.left + (rect.width / 2) - (tooltipWidth / 2)
          );
          left = Math.min(left, window.innerWidth - tooltipWidth - 20);
          arrowDir = 'up';
          break;
        case 'top':
          top = Math.max(20, rect.top - tooltipHeight - spacing);
          left = Math.max(
            20,
            rect.left + (rect.width / 2) - (tooltipWidth / 2)
          );
          left = Math.min(left, window.innerWidth - tooltipWidth - 20);
          arrowDir = 'down';
          break;
        case 'left':
          top = Math.max(20, rect.top + (rect.height / 2) - (tooltipHeight / 2));
          left = Math.max(20, rect.left - tooltipWidth - spacing);
          top = Math.min(top, window.innerHeight - tooltipHeight - 20);
          arrowDir = 'right';
          break;
        case 'right':
          top = Math.max(20, rect.top + (rect.height / 2) - (tooltipHeight / 2));
          left = rect.right + spacing;
          left = Math.min(left, window.innerWidth - tooltipWidth - 20);
          top = Math.min(top, window.innerHeight - tooltipHeight - 20);
          arrowDir = 'left';
          break;
      }

      setPosition({ top, left });
      setArrowPosition({
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width / 2,
        direction: arrowDir as 'up' | 'down' | 'left' | 'right'
      });
      setIsVisible(true);
    };

    const retryInterval = setInterval(() => {
      const target = document.querySelector(steps[currentStep].target);
      if (target) {
        updatePosition();
        clearInterval(retryInterval);
      }
    }, 100);

    updatePosition();
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      clearInterval(retryInterval);
    };
  }, [isActive, currentStep, steps]);

  useEffect(() => {
    if (!isActive || !steps[currentStep].validation) return;

    const { validation } = steps[currentStep];
    let modalCheckPassed = false;
    let checkTimeout: NodeJS.Timeout;

    const handleAction = async (e: Event) => {
      const targetElement = e.target as HTMLElement;
      if (!targetElement.matches(validation.selector)) return;

      // If we need to check for modal
      if (validation.checkModal) {
        // Wait for modal to appear/disappear
        checkTimeout = setTimeout(() => {
          modalCheckPassed = true;
          runAdditionalChecks();
        }, 500);
        return;
      }

      runAdditionalChecks();
    };

    const runAdditionalChecks = () => {
      if (validation.additionalChecks) {
        for (const check of validation.additionalChecks) {
          const element = document.querySelector(check.selector);

          switch (check.condition) {
            case 'exists':
              if (!element) return;
              break;
            case 'notExists':
              if (element) return;
              break;
            case 'hasClass':
              if (!element?.classList.contains(check.className!)) return;
              break;
            case 'notHasClass':
              if (element?.classList.contains(check.className!)) return;
              break;
          }
        }
      }

      // All checks passed, move to next step
      nextStep();
    };

    document.addEventListener(validation.event, handleAction);

    return () => {
      document.removeEventListener(validation.event, handleAction);
      if (checkTimeout) clearTimeout(checkTimeout);
    };
  }, [isActive, currentStep, steps, nextStep]);

  if (!isActive || !isVisible) return null;

  return (
    <Portal container={document.body}>
      <IndicatorDot
        top={arrowPosition.top}
        left={arrowPosition.left}
      />
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tutorial-step-title"
        className="fixed bg-card text-foreground border border-border rounded-lg shadow-lg p-4 w-[300px] z-modal"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: 9999,
        }}
      >
        <h3 id="tutorial-step-title" className="text-lg font-semibold text-foreground">{steps[currentStep].title}</h3>
        <p className="mt-2 text-muted-foreground">{steps[currentStep].content}</p>

        <div className="mt-4 flex justify-between">
          <Button
            variant="outline"
            onClick={previousStep}
            disabled={currentStep === 0}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={skipTutorial}
          >
            Skip
          </Button>
          <Button
            variant="default"
            onClick={nextStep}
          >
            {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </Portal>
  );
};