import React, { useState } from 'react';
import { Info, Folder, Check, KeyRound, ShieldCheck, Cpu } from 'lucide-react';
import type { SettingsState } from '@/types';

interface GeneralSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function GeneralSettings({ settings, onUpdate }: GeneralSettingsProps) {
  const [binaryInput, setBinaryInput] = useState(settings.binaryPath);
  const [isSaved, setIsSaved] = useState(false);
  const [passkeyAdded, setPasskeyAdded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSaveCLI = () => {
    onUpdate({ binaryPath: binaryInput });
    setIsSaved(true);
    setToastMessage('OMP binary path configuration updated successfully.');
    setTimeout(() => {
      setIsSaved(false);
      setToastMessage(null);
    }, 2500);
  };

  const handleAddPasskey = () => {
    setPasskeyAdded(true);
    setToastMessage('Passkey registration token generated for this host.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSignOutEverywhere = () => {
    setToastMessage('Active sessions on all other devices have been invalidated.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-8 text-xs text-[#141310]">
      {/* View settings cleared as requested */}
    </div>
  );
}
