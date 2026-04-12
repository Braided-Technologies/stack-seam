import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import type { TooltipRenderProps } from 'react-joyride';
import { useTour } from '@/contexts/TourContext';
import { siteTourSteps, getStepsForPage, getNextPage, getPageStartIndex } from './tourSteps';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

function TourTooltip({
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  closeProps,
  tooltipProps,
}: TooltipRenderProps) {
  const globalIndex = (step as any)._globalIndex ?? index;
  const totalSteps = siteTourSteps.length;
  const nextPage = getNextPage((step as any).page);
  const pageSteps = getStepsForPage((step as any).page);
  const isLastStepOnPage = index === pageSteps.length - 1;
  const isLastStepOverall = !nextPage && isLastStepOnPage;

  return (
    <div
      {...tooltipProps}
      className="rounded-xl border bg-card text-card-foreground shadow-lg max-w-sm z-[10000]"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            Step {globalIndex + 1} of {totalSteps}
          </span>
          <button
            {...closeProps}
            className="text-muted-foreground hover:text-foreground transition-colors -mt-1 -mr-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm leading-relaxed">{step.content}</p>
      </div>
      <div className="flex items-center justify-between border-t px-4 py-3">
        <button
          {...skipProps}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip tour
        </button>
        <div className="flex gap-2">
          {index > 0 && (
            <Button {...backProps} variant="outline" size="sm">
              Back
            </Button>
          )}
          <Button {...primaryProps} size="sm">
            {isLastStepOverall ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildPageSteps(pathname: string) {
  const pageSteps = getStepsForPage(pathname);
  const startIndex = getPageStartIndex(pathname);
  return pageSteps.map((step, i) => ({
    ...step,
    _globalIndex: startIndex + i,
  }));
}

export default function SiteTour() {
  const { isTourActive, currentStep, setStep, completeTour, skipTour } = useTour();
  const location = useLocation();
  const navigate = useNavigate();
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const pendingNav = useRef<string | null>(null);

  const currentGlobalStep = siteTourSteps[currentStep];
  const expectedPage = currentGlobalStep?.page;

  // Load steps and start tour when active and on correct page
  useEffect(() => {
    if (!isTourActive) {
      setRun(false);
      return;
    }

    const onCorrectPage =
      pendingNav.current === location.pathname || // arrived at nav target
      (!pendingNav.current && expectedPage === location.pathname); // initial start

    if (onCorrectPage) {
      pendingNav.current = null;
      const pageSteps = buildPageSteps(location.pathname);
      if (pageSteps.length > 0) {
        setSteps(pageSteps);
        const timer = setTimeout(() => setRun(true), 400);
        return () => clearTimeout(timer);
      }
    }
  }, [isTourActive, location.pathname, expectedPage]);

  // Escape key bail-out
  useEffect(() => {
    if (!isTourActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRun(false);
        pendingNav.current = null;
        skipTour();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isTourActive, skipTour]);

  // Joyride v3 event handler (replaces v2's "callback" prop)
  const handleEvent = useCallback(
    (data: any) => {
      const { status, action } = data;

      // User clicked "Skip tour"
      if (status === STATUS.SKIPPED) {
        setRun(false);
        pendingNav.current = null;
        skipTour();
        return;
      }

      // User clicked X close button mid-tour
      if (action === ACTIONS.CLOSE && status !== STATUS.FINISHED) {
        setRun(false);
        pendingNav.current = null;
        skipTour();
        return;
      }

      // All steps on this page completed
      if (status === STATUS.FINISHED) {
        setRun(false);

        const nextPage = getNextPage(location.pathname);
        if (nextPage) {
          const nextIndex = getPageStartIndex(nextPage);
          pendingNav.current = nextPage;
          setStep(nextIndex);
          setTimeout(() => navigate(nextPage), 150);
        } else {
          completeTour();
        }
        return;
      }
    },
    [completeTour, skipTour, setStep, navigate, location.pathname],
  );

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      scrollToFirstStep
      disableOverlayClose
      disableScrolling={false}
      spotlightClicks={false}
      onEvent={handleEvent}
      tooltipComponent={TourTooltip}
      floaterProps={{ disableAnimation: false }}
      styles={{
        options: {
          zIndex: 10000,
          arrowColor: 'hsl(var(--card))',
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
        },
        spotlight: {
          borderRadius: 12,
        },
      }}
    />
  );
}
