import React, { useState } from 'react';
import { toast } from '../stores/toastStore';
import { Slack } from 'lucide-react';

type SlackIntegrationProps = {
  showTitle?: boolean;
};

export const SlackIntegration = ({ showTitle = true }: SlackIntegrationProps) => {
  const [token, setToken] = useState<string | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleConnect = async () => {
    try {
      console.log("Opening Slack Login...");
      // 1. Open Popup & Get Token
      const result = await window.kakarot.slack.connect();
      console.log("Slack Connected!", result);
      
      setToken(result.accessToken);
      
      // 2. Fetch Channels immediately
      const channelList = await window.kakarot.slack.getChannels(result.accessToken);
      setChannels(channelList);
    } catch (err) {
      console.error("Slack Connect Failed:", err);
      toast.error("Failed to connect to Slack");
    }
  };

  const handleSend = async () => {
    if (!token || !selectedChannel) return;
    
    setIsSending(true);
    try {
      await window.kakarot.slack.sendNote(token, selectedChannel, "🚀 This is a test note from Treeto!");
      toast.success('Note sent successfully!');
    } catch (err) {
      console.error("Failed to send:", err);
      toast.error("Failed to send note.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-4 rounded-lg border border-gray-700 bg-gray-800">
      {showTitle && (
        <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
          <span className="text-2xl">💬</span> Slack Integration
        </h3>
      )}
      
      {!token ? (
        <button 
          onClick={handleConnect}
          className="w-full bg-[#4A154B] text-white py-2 px-4 rounded hover:opacity-90 transition-opacity font-medium flex items-center justify-center gap-2"
        >
          Connect <Slack className="w-4 h-4" />
        </button>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-green-400 font-medium">✅ Connected</div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Select Channel</label>
            <select 
              className="w-full p-2 border border-gray-700 rounded bg-gray-900 text-white"
              onChange={(e) => setSelectedChannel(e.target.value)}
              value={selectedChannel}
            >
              <option value="">-- Choose a channel --</option>
              {channels.map(c => (
                <option key={c.id} value={c.id}>
                  {c.isPrivate ? '🔒' : '#'} {c.name}
                </option>
              ))}
            </select>
          </div>

          <button 
            onClick={handleSend} 
            disabled={!selectedChannel || isSending}
            className={`w-full py-2 px-4 rounded font-medium text-white transition-colors ${
              !selectedChannel || isSending 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-[#4ea8dd] hover:bg-[#3d96cb]'
            }`}
          >
            {isSending ? 'Sending...' : 'Send Test Note'}
          </button>
        </div>
      )}
    </div>
  );
};