import { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { errorMessage, repoService } from '../lib/bridge';

export default function Settings() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const key = await repoService.getOpenAIApiKey();
        if (mounted) setApiKey(key);
      } catch (e: unknown) {
        if (mounted) setError(errorMessage(e));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await repoService.setOpenAIApiKey(apiKey);
      setSaved(true);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="p-1.5 hover:bg-accent rounded-lg transition-colors"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground">Configure AI commit message generation</p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-2xl space-y-3">
        <label className="block text-sm font-medium" htmlFor="openai-api-key">
          OpenAI API Key
        </label>
        <input
          id="openai-api-key"
          type="password"
          className="w-full px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={loading || saving}
        />
        <p className="text-xs text-muted-foreground">
          Stored locally in <code>~/.multi/settings.json</code>.
        </p>

        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 rounded px-2 py-1">{error}</div>
        )}
        {saved && !error && (
          <div className="text-xs text-green-600 bg-green-500/10 rounded px-2 py-1">Saved.</div>
        )}

        <div>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
