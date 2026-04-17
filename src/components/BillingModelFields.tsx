import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { applyInternalCostRatio } from '@/lib/costs';

export type BillingModel = 'internal' | 'bundled_passthrough' | 'direct_passthrough';

export function normalizeBillingModel(value: string | null | undefined): BillingModel {
  if (value === 'bundled_passthrough' || value === 'direct_passthrough') return value;
  return 'internal';
}

interface BillingModelFieldsProps {
  billingModel: string | null;
  internalCostMonthly: number | null;
  internalCostAnnual: number | null;
  disabled?: boolean;
  onChange: (patch: {
    billing_model?: BillingModel;
    internal_cost_monthly?: number | null;
    internal_cost_annual?: number | null;
  }) => void;
}

// How is this tool consumed? Internal-only, bundled into client services (we pay
// total, part is overhead / part recoups via bundled billing), or pure passthrough
// (client pays vendor through us — zero internal overhead).
//
// Only 'bundled_passthrough' surfaces the "internal portion" inputs. For 'internal'
// the full cost IS the internal cost. For 'direct_passthrough' internal cost is
// conceptually zero (we clear the fields on that switch).
export function BillingModelFields({
  billingModel,
  internalCostMonthly,
  internalCostAnnual,
  disabled,
  onChange,
}: BillingModelFieldsProps) {
  const model = normalizeBillingModel(billingModel);

  const setModel = (next: BillingModel) => {
    if (next === 'internal' || next === 'direct_passthrough') {
      onChange({ billing_model: next, internal_cost_monthly: null, internal_cost_annual: null });
    } else {
      onChange({ billing_model: next });
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Cost Type</Label>
        <RadioGroup
          value={model}
          onValueChange={v => setModel(v as BillingModel)}
          disabled={disabled}
          className="gap-1.5"
        >
          <label className={`flex items-start gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
            <RadioGroupItem value="internal" className="mt-0.5" />
            <span className="text-sm leading-tight">
              <span className="font-medium">Internal only</span>
              <span className="block text-xs text-muted-foreground">We use this tool. Full cost is our overhead.</span>
            </span>
          </label>
          <label className={`flex items-start gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
            <RadioGroupItem value="bundled_passthrough" className="mt-0.5" />
            <span className="text-sm leading-tight">
              <span className="font-medium">Bundled with client services</span>
              <span className="block text-xs text-muted-foreground">We pay the vendor; part of the cost is recovered via bundled client billing.</span>
            </span>
          </label>
          <label className={`flex items-start gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
            <RadioGroupItem value="direct_passthrough" className="mt-0.5" />
            <span className="text-sm leading-tight">
              <span className="font-medium">Direct passthrough</span>
              <span className="block text-xs text-muted-foreground">Client is billed directly; no internal overhead.</span>
            </span>
          </label>
        </RadioGroup>
      </div>

      {model === 'bundled_passthrough' && (
        <div className="grid grid-cols-2 gap-4 rounded-md border border-border/60 bg-muted/30 p-3">
          <div className="space-y-2">
            <Label>Internal Monthly ($)</Label>
            <Input
              type="number"
              value={internalCostMonthly ?? ''}
              onChange={e => onChange(applyInternalCostRatio('internal_cost_monthly', e.target.value))}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Internal Annual ($)</Label>
            <Input
              type="number"
              value={internalCostAnnual ?? ''}
              onChange={e => onChange(applyInternalCostRatio('internal_cost_annual', e.target.value))}
              disabled={disabled}
            />
          </div>
          <p className="col-span-2 text-xs text-muted-foreground -mt-1">
            The portion of the total cost that's real overhead (vs recovered through client bundling).
          </p>
        </div>
      )}
    </div>
  );
}
