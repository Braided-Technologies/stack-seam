import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type TourContextType = {
  loaded: boolean;
  tourCompleted: boolean;
  isTourActive: boolean;
  currentStep: number;
  showPrompt: boolean;
  startTour: () => void;
  setStep: (index: number) => void;
  completeTour: () => void;
  skipTour: () => void;
  resetTour: () => void;
  dismissPrompt: () => void;
};

const TOUR_SESSION_KEY = 'stackseam_tour_state';

/** Persist in-progress tour state to sessionStorage for page-refresh survival */
function saveTourSession(active: boolean, step: number) {
  try {
    sessionStorage.setItem(TOUR_SESSION_KEY, JSON.stringify({ active, step }));
  } catch {}
}

function loadTourSession(): { active: boolean; step: number } | null {
  try {
    const raw = sessionStorage.getItem(TOUR_SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function clearTourSession() {
  try { sessionStorage.removeItem(TOUR_SESSION_KEY); } catch {}
}

const TourContext = createContext<TourContextType>({} as TourContextType);

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [tourCompleted, setTourCompleted] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [promptDismissed, setPromptDismissed] = useState(false);

  // Load tour state from user metadata + sessionStorage
  useEffect(() => {
    if (user) {
      const meta = user.user_metadata;
      const completed = meta?.site_tour_completed === true;
      setTourCompleted(completed);
      setPromptDismissed(meta?.tour_prompt_dismissed === true);

      // Don't auto-restore mid-tour from sessionStorage — it causes
      // stuck states. Instead, just remember the step so "Start Tour"
      // can resume. Clear any stale active state.
      clearTourSession();

      setLoaded(true);
    } else {
      setTourCompleted(false);
      setPromptDismissed(false);
      setLoaded(false);
      setIsTourActive(false);
      setCurrentStep(0);
    }
  }, [user?.id]);

  const showPrompt = loaded && !tourCompleted && !promptDismissed && !isTourActive;

  const startTour = useCallback(() => {
    setIsTourActive(true);
    setCurrentStep(0);
    setPromptDismissed(true);
    saveTourSession(true, 0);
  }, []);

  const setStep = useCallback((index: number) => {
    setCurrentStep(index);
    saveTourSession(true, index);
  }, []);

  const completeTour = useCallback(async () => {
    setIsTourActive(false);
    setTourCompleted(true);
    setCurrentStep(0);
    clearTourSession();
    await supabase.auth.updateUser({
      data: { site_tour_completed: true, tour_prompt_dismissed: true },
    });
  }, []);

  const skipTour = useCallback(async () => {
    setIsTourActive(false);
    setTourCompleted(true);
    setCurrentStep(0);
    clearTourSession();
    await supabase.auth.updateUser({
      data: { site_tour_completed: true, tour_prompt_dismissed: true },
    });
  }, []);

  const dismissPrompt = useCallback(async () => {
    setPromptDismissed(true);
    await supabase.auth.updateUser({
      data: { tour_prompt_dismissed: true },
    });
  }, []);

  const resetTour = useCallback(async () => {
    setTourCompleted(false);
    setIsTourActive(false);
    setCurrentStep(0);
    setPromptDismissed(false);
    clearTourSession();
    await supabase.auth.updateUser({
      data: { site_tour_completed: false, tour_prompt_dismissed: false },
    });
  }, []);

  return (
    <TourContext.Provider
      value={{
        loaded,
        tourCompleted,
        isTourActive,
        currentStep,
        showPrompt,
        startTour,
        setStep,
        completeTour,
        skipTour,
        resetTour,
        dismissPrompt,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export const useTour = () => useContext(TourContext);
