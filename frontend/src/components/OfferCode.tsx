import { useState } from "react";
import { ApiError, api, type Redeemed } from "../lib/api";
import { money } from "../lib/format";
import { toast, useAuth, useOffer } from "../store/useStore";

/** Credit a code to the signed-in household's wallet, and say how it went. */
export async function redeemOffer(code: string): Promise<Redeemed | null> {
  try {
    const res = await api.post<Redeemed>("/offers/redeem/", { code });
    useOffer.getState().setCode("");
    void useAuth.getState().refreshUser();
    toast(
      res.is_referral
        ? `${money(res.amount)} welcome credit is in your wallet.`
        : `${res.code} applied: ${money(res.amount)} is in your wallet.`,
    );
    return res;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Could not apply that code.", "error");
    return null;
  }
}

export const cleanCode = (value: string) => value.toUpperCase().replace(/\s/g, "").slice(0, 20);

export function OfferCodeField({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(value !== "");

  if (!open) {
    return (
      <button type="button" className="linkish" onClick={() => setOpen(true)}>
        Have an offer code?
      </button>
    );
  }

  return (
    <label className="field">
      <span className="label">Offer code</span>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(cleanCode(e.target.value))}
        placeholder="FIRSTLIGHT20"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />
      <span className="hint">Goes into your wallet as soon as your basket is set up.</span>
    </label>
  );
}
