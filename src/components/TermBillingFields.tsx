import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TermChoice = 'monthly' | '1y' | 'multi';

function termMonthsToChoice(months: number | null | undefined): TermChoice {
  if (months == null || months <= 1) return 'monthly';
  if (months <= 12) return '1y';
  return 'multi';
}

function multiYearFromMonths(months: number | null | undefined): number {
  if (!months || months < 24) return 2;
  return Math.max(2, Math.round(months / 12));
}

interface TermBillingFieldsProps {
  termMonths: number | null;
  billingCycle: string | null;
  startDate: string | null;
  disabled?: boolean;
  onChange: (patch: { term_months?: number | null; billing_cycle?: string | null; start_date?: string | null }) => void;
  compact?: boolean;
}

export function TermBillingFields({ termMonths, billingCycle, startDate, disabled, onChange, compact }: TermBillingFieldsProps) {
  const choice = termMonthsToChoice(termMonths);
  const years = choice === 'multi' ? multiYearFromMonths(termMonths) : 2;

  const setChoice = (next: TermChoice) => {
    if (next === 'monthly') onChange({ term_months: null, start_date: null });
    else if (next === '1y') onChange({ term_months: 12 });
    else onChange({ term_months: years * 12 });
  };

  const setYears = (n: number) => {
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(2, Math.min(20, Math.round(n)));
    onChange({ term_months: clamped * 12 });
  };

  const labelCls = compact ? 'text-xs' : 'text-sm';
  const inputCls = compact ? 'h-7 text-xs' : '';
  const selectCls = compact
    ? 'flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs'
    : 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
  const rowCls = compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-4';
  const groupCls = compact ? 'space-y-1' : 'space-y-2';
  const containerCls = compact ? 'space-y-2' : 'space-y-4';

  return (
    <div className={containerCls}>
      <div className={rowCls}>
        <div className={groupCls}>
          <Label className={compact ? 'text-xs font-medium' : undefined}>Term</Label>
          <RadioGroup
            value={choice}
            onValueChange={v => setChoice(v as TermChoice)}
            disabled={disabled}
            className="gap-1.5"
          >
            <label className={`flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <RadioGroupItem value="monthly" />
              <span className={labelCls}>Monthly</span>
            </label>
            <label className={`flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <RadioGroupItem value="1y" />
              <span className={labelCls}>1 year</span>
            </label>
            <label className={`flex items-center gap-2 flex-wrap ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <RadioGroupItem value="multi" />
              <span className={labelCls}>Multi-year</span>
              {choice === 'multi' && (
                <>
                  <Input
                    type="number"
                    min={2}
                    max={20}
                    value={years}
                    onChange={e => setYears(Number(e.target.value))}
                    disabled={disabled}
                    className={`${compact ? 'h-6 text-xs w-14' : 'h-8 w-16'} ml-1`}
                    onClick={e => e.stopPropagation()}
                  />
                  <span className={`${labelCls} text-muted-foreground`}>years</span>
                </>
              )}
            </label>
          </RadioGroup>
        </div>
        <div className={groupCls}>
          <Label className={compact ? 'text-xs font-medium' : undefined}>Billing Cycle</Label>
          <select
            className={selectCls}
            value={billingCycle || ''}
            onChange={e => onChange({ billing_cycle: e.target.value || null })}
            disabled={disabled}
          >
            <option value="">Select...</option>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
            <option value="multi-year">Multi-Year</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      {choice !== 'monthly' && (
        <div className={rowCls}>
          <div className={groupCls}>
            <Label className={compact ? 'text-xs font-medium' : undefined}>Start Date</Label>
            <Input
              type="date"
              value={startDate || ''}
              onChange={e => onChange({ start_date: e.target.value || null })}
              disabled={disabled}
              className={inputCls}
            />
          </div>
          <div />
        </div>
      )}
    </div>
  );
}
