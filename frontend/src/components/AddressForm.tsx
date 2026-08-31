import { useState } from "react";
import { ApiError, api, type Address } from "../lib/api";
import { toast, useAuth } from "../store/useStore";
import { Spinner } from "./ui";

const BLANK = {
  label: "home",
  contact_name: "",
  contact_phone: "",
  line1: "",
  landmark: "",
  village: "Suratgarh",
  district: "Sriganganagar",
  state: "Rajasthan",
  pincode: "",
  delivery_note: "",
};

export function AddressForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Address;
  onSaved: (address: Address) => void;
  onCancel?: () => void;
}) {
  const user = useAuth((s) => s.user);
  const loadAddresses = useAuth((s) => s.loadAddresses);
  const [form, setForm] = useState({
    ...BLANK,
    contact_name: user?.full_name ?? "",
    contact_phone: user?.phone ?? "",
    ...(initial ?? {}),
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const set =
    (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const err = (key: string) => errors[key]?.[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = initial
        ? await api.put<Address>(`/addresses/${initial.id}/`, form)
        : await api.post<Address>("/addresses/", form);
      await loadAddresses();
      toast(initial ? "Address updated." : "Address saved.");
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        toast(e.message, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid2">
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={form.contact_name} onChange={set("contact_name")} required autoComplete="name" />
          {err("contact_name") && <span className="err">{err("contact_name")}</span>}
        </label>
        <label className="field">
          <span className="label">Phone</span>
          <input
            className="input num"
            value={form.contact_phone}
            onChange={set("contact_phone")}
            inputMode="numeric"
            maxLength={10}
            required
            autoComplete="tel-national"
          />
          {err("contact_phone") && <span className="err">{err("contact_phone")}</span>}
        </label>
      </div>

      <label className="field">
        <span className="label">House &amp; street</span>
        <input className="input" value={form.line1} onChange={set("line1")} required autoComplete="address-line1" />
        {err("line1") && <span className="err">{err("line1")}</span>}
      </label>

      <label className="field">
        <span className="label">Landmark</span>
        <input className="input" value={form.landmark} onChange={set("landmark")} placeholder="Near the water tank" />
      </label>

      <div className="grid2">
        <label className="field">
          <span className="label">Village / town</span>
          <input className="input" value={form.village} onChange={set("village")} required />
        </label>
        <label className="field">
          <span className="label">PIN code</span>
          <input
            className="input num"
            value={form.pincode}
            onChange={set("pincode")}
            inputMode="numeric"
            maxLength={6}
            required
            autoComplete="postal-code"
          />
          {err("pincode") && <span className="err">{err("pincode")}</span>}
        </label>
      </div>

      <label className="field">
        <span className="label">Type</span>
        <select className="select" value={form.label} onChange={set("label")}>
          <option value="home">Home</option>
          <option value="work">Work</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className="field">
        <span className="label">Note for the rider</span>
        <textarea
          className="textarea"
          value={form.delivery_note}
          onChange={set("delivery_note")}
          placeholder="Leave the pot at the gate, do not ring the bell before six."
        />
      </label>

      <div className="inline mt-3" style={{ flexWrap: "nowrap", paddingBottom: "var(--sp-4)" }}>
        <button className="btn btn--primary" style={{ flex: 1 }} disabled={saving}>
          {saving ? <Spinner /> : null}
          {initial ? "Save changes" : "Save address"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
