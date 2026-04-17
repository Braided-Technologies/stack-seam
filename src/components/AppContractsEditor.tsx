import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { TermBillingFields } from '@/components/TermBillingFields';
import { BillingModelFields } from '@/components/BillingModelFields';
import {
  useUserApplicationContracts,
  useUpsertUserApplicationContract,
  useDeleteUserApplicationContract,
} from '@/hooks/useStackData';
import { applyCostRatio } from '@/lib/costs';

interface AppContractsEditorProps {
  userApplicationId: string;
  disabled?: boolean;
}

type ContractDraft = Record<string, any> & { id?: string; user_application_id: string };

// Contracts editor for the per-app Details tab. Renders one card per contract
// with inline edit + Save, plus an Add Contract button. Each contract tracks its
// own cost, term, billing, and cost type — the app-level aggregates are summed
// at read time in Budget.tsx.
export function AppContractsEditor({ userApplicationId, disabled }: AppContractsEditorProps) {
  const { data: contracts = [], isLoading } = useUserApplicationContracts(userApplicationId);
  const upsert = useUpsertUserApplicationContract();
  const remove = useDeleteUserApplicationContract();

  // Local drafts keyed by contract id (or temp key for new ones)
  const [drafts, setDrafts] = useState<Record<string, ContractDraft>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  // Hydrate drafts from server data when contracts change (new contract added, or first load)
  useEffect(() => {
    setDrafts(prev => {
      const next: Record<string, ContractDraft> = {};
      for (const c of contracts as any[]) {
        // Keep in-flight edits if any; otherwise seed from server
        next[c.id] = prev[c.id] && prev[c.id].__dirty
          ? prev[c.id]
          : { ...c };
      }
      // Preserve any unsaved "new" drafts (keyed with temp ids)
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith('new:')) next[k] = v;
      }
      return next;
    });
  }, [contracts]);

  const updateDraft = (key: string, patch: Record<string, any>) => {
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch, __dirty: true } }));
  };

  const addContract = () => {
    const tempId = `new:${crypto.randomUUID()}`;
    setDrafts(prev => ({
      ...prev,
      [tempId]: {
        user_application_id: userApplicationId,
        label: '',
        billing_model: 'internal',
        __dirty: true,
      },
    }));
  };

  const saveContract = async (key: string) => {
    const draft = drafts[key];
    if (!draft) return;
    const payload: any = {
      user_application_id: userApplicationId,
      label: draft.label || null,
      cost_monthly: draft.cost_monthly !== '' && draft.cost_monthly != null ? Number(draft.cost_monthly) : null,
      cost_annual: draft.cost_annual !== '' && draft.cost_annual != null ? Number(draft.cost_annual) : null,
      billing_cycle: draft.billing_cycle || null,
      term_months: draft.term_months ? Number(draft.term_months) : null,
      start_date: draft.start_date || null,
      renewal_date: draft.renewal_date || null,
      billing_model: draft.billing_model || 'internal',
      internal_cost_monthly: draft.internal_cost_monthly !== '' && draft.internal_cost_monthly != null ? Number(draft.internal_cost_monthly) : null,
      internal_cost_annual: draft.internal_cost_annual !== '' && draft.internal_cost_annual != null ? Number(draft.internal_cost_annual) : null,
      license_count: draft.license_count ? Number(draft.license_count) : null,
      notes: draft.notes || null,
    };
    if (!key.startsWith('new:')) payload.id = draft.id;
    try {
      const saved = await upsert.mutateAsync(payload);
      // If this was a new contract, drop the temp draft and let the useEffect
      // above rehydrate from the server data under the real id.
      if (key.startsWith('new:')) {
        setDrafts(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        setDrafts(prev => ({ ...prev, [key]: { ...(saved as any), __dirty: false } }));
      }
      toast({ title: 'Contract saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    // Unsaved new drafts can be removed locally
    if (deleting.startsWith('new:')) {
      setDrafts(prev => {
        const next = { ...prev };
        delete next[deleting];
        return next;
      });
      setDeleting(null);
      return;
    }
    try {
      await remove.mutateAsync({ id: deleting, user_application_id: userApplicationId });
      setDeleting(null);
      toast({ title: 'Contract removed' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

  const draftEntries = Object.entries(drafts);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Loading contracts…</div>;
  }

  return (
    <div className="space-y-4">
      {draftEntries.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No contracts yet. Add one to track cost, renewal dates, and cost type for this app.
        </p>
      )}

      {draftEntries.map(([key, draft], i) => (
        <div key={key} className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground">Contract label</Label>
              <Input
                value={draft.label ?? ''}
                onChange={e => updateDraft(key, { label: e.target.value })}
                placeholder={draftEntries.length > 1 ? `e.g. Internal tenant, MSSP - Acme` : 'Optional label'}
                disabled={disabled}
                className="mt-1"
              />
            </div>
            {!disabled && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive shrink-0 mt-5"
                onClick={() => setDeleting(key)}
                title="Delete contract"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Monthly Cost ($)</Label>
              <Input
                type="number"
                value={draft.cost_monthly ?? ''}
                onChange={e => updateDraft(key, applyCostRatio('cost_monthly', e.target.value))}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Annual Cost ($)</Label>
              <Input
                type="number"
                value={draft.cost_annual ?? ''}
                onChange={e => updateDraft(key, applyCostRatio('cost_annual', e.target.value))}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>License Count</Label>
            <Input
              type="number"
              value={draft.license_count ?? ''}
              onChange={e => updateDraft(key, { license_count: e.target.value })}
              disabled={disabled}
            />
          </div>

          <TermBillingFields
            termMonths={draft.term_months ? Number(draft.term_months) : null}
            billingCycle={draft.billing_cycle || null}
            startDate={draft.start_date || null}
            renewalDate={draft.renewal_date || null}
            disabled={disabled}
            onChange={patch => updateDraft(key, patch)}
          />

          <BillingModelFields
            billingModel={draft.billing_model || 'internal'}
            internalCostMonthly={draft.internal_cost_monthly ?? null}
            internalCostAnnual={draft.internal_cost_annual ?? null}
            disabled={disabled}
            onChange={patch => updateDraft(key, patch)}
          />

          <div className="space-y-2">
            <Label>Notes</Label>
            <textarea
              className="min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={draft.notes || ''}
              onChange={e => updateDraft(key, { notes: e.target.value })}
              disabled={disabled}
            />
          </div>

          {!disabled && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => saveContract(key)} disabled={upsert.isPending}>
                {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save Contract
              </Button>
            </div>
          )}
        </div>
      ))}

      {!disabled && (
        <Button variant="outline" className="w-full gap-2" onClick={addContract}>
          <Plus className="h-4 w-4" />
          Add Contract
        </Button>
      )}

      <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the contract row (cost, term, renewal, cost type). Uploaded documents stay with the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
