import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Settings as SettingsIcon, Key, Cpu, Building2 } from 'lucide-react';

const PROVIDERS = [
  { value: 'lovable', label: 'Built-in AI (default)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

const MODELS: Record<string, { value: string; label: string }[]> = {
  lovable: [
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (Fast)' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Best)' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini (Balanced)' },
    { value: 'openai/gpt-5', label: 'GPT-5 (Powerful)' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-5', label: 'GPT-5' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
};

export default function Settings() {
  const { orgId, orgName, userRole, refreshOrg } = useAuth();
  const { toast } = useToast();
  
  // Org settings
  const [companyName, setCompanyName] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);

  // AI settings
  const [provider, setProvider] = useState('lovable');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('google/gemini-3-flash-preview');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgName) setCompanyName(orgName);
  }, [orgName]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from('org_settings')
        .select('setting_key, setting_value')
        .eq('organization_id', orgId)
        .in('setting_key', ['ai_provider', 'ai_api_key', 'ai_model']);

      if (data) {
        for (const s of data) {
          if (s.setting_key === 'ai_provider' && s.setting_value) setProvider(s.setting_value);
          if (s.setting_key === 'ai_api_key' && s.setting_value) setApiKey(s.setting_value);
          if (s.setting_key === 'ai_model' && s.setting_value) setModel(s.setting_value);
        }
      }
      setLoading(false);
    })();
  }, [orgId]);

  const handleSaveOrg = async () => {
    if (!orgId || !companyName.trim()) return;
    setSavingOrg(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ name: companyName.trim() })
        .eq('id', orgId);
      if (error) throw error;
      await refreshOrg();
      toast({ title: 'Company name updated' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSavingOrg(false);
  };

  const saveSetting = async (key: string, value: string) => {
    if (!orgId) return;
    const { error } = await supabase
      .from('org_settings')
      .upsert({ organization_id: orgId, setting_key: key, setting_value: value }, { onConflict: 'organization_id,setting_key' });
    if (error) throw error;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting('ai_provider', provider);
      await saveSetting('ai_model', model);
      if (provider !== 'lovable') {
        await saveSetting('ai_api_key', apiKey);
      }
      toast({ title: 'Settings saved', description: 'AI configuration updated successfully.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save settings', variant: 'destructive' });
    }
    setSaving(false);
  };

  if (userRole !== 'admin') {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Settings</h1>
        <p className="text-muted-foreground">Only administrators can access settings.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Company / Organization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company
          </CardTitle>
          <CardDescription>
            Manage your company name and organization details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Acme MSP"
              maxLength={100}
            />
          </div>
          <Button onClick={handleSaveOrg} disabled={savingOrg || !companyName.trim() || companyName.trim() === orgName}>
            {savingOrg ? 'Saving...' : 'Update Company Name'}
          </Button>
        </CardContent>
      </Card>

      {/* AI Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            AI Configuration
          </CardTitle>
          <CardDescription>
            Configure the AI provider for the Research Assistant. Built-in AI works out of the box. Power users can connect their own API keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>AI Provider</Label>
                <Select value={provider} onValueChange={v => { setProvider(v); setModel(MODELS[v]?.[0]?.value || ''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {provider !== 'lovable' && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Key className="h-3 w-3" /> API Key
                  </Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={`Enter your ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your API key is stored securely and only used for AI research queries.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(MODELS[provider] || []).map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
