import { useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "../store/useStore";
import { AddressForm } from "./AddressForm";
import { PhoneSignIn } from "./SignIn";

export type AccountStep = "signin" | "address";

/** What still stands between this visitor and starting a basket, read fresh from the store. */
export function accountStep(): AccountStep | null {
  const { user, addresses } = useAuth.getState();
  if (!user) return "signin";
  return addresses.length ? null : "address";
}

export function useAccountStep(): AccountStep | null {
  const signedIn = useAuth((s) => s.user !== null);
  const hasAddress = useAuth((s) => s.addresses.length > 0);
  if (!signedIn) return "signin";
  return hasAddress ? null : "address";
}

/** Sign in, then add an address if there isn't one, then carry on with what they were doing. */
export function AccountSteps({ summary, onReady }: { summary?: ReactNode; onReady: () => void }) {
  const step = useAccountStep();
  const ready = useRef(onReady);
  ready.current = onReady;
  const fired = useRef(false);

  useEffect(() => {
    if (step !== null || fired.current) return;
    fired.current = true;
    ready.current();
  }, [step]);

  return (
    <>
      {summary}
      {step === "signin" && <PhoneSignIn />}
      {step === "address" && (
        <>
          <p className="sm muted mb-2">Last step: where should the rider bring it?</p>
          <AddressForm onSaved={() => undefined} />
        </>
      )}
    </>
  );
}
