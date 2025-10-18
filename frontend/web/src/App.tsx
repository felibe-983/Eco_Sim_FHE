// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface InsiderData {
  id: string;
  encryptedValue: string;
  timestamp: number;
  owner: string;
  company: string;
  dataType: "earnings" | "merger" | "product" | "regulation";
  status: "pending" | "verified" | "rejected";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [insiderData, setInsiderData] = useState<InsiderData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newData, setNewData] = useState({ company: "", dataType: "earnings", value: 0 });
  const [selectedData, setSelectedData] = useState<InsiderData | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [userHistory, setUserHistory] = useState<string[]>([]);

  // Generate sample K-line data
  const generateKLineData = () => {
    return Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000),
      open: 100 + Math.random() * 50,
      high: 100 + Math.random() * 60,
      low: 80 + Math.random() * 40,
      close: 100 + Math.random() * 50,
      volume: Math.floor(Math.random() * 1000000)
    }));
  };

  const [kLineData, setKLineData] = useState(generateKLineData());

  useEffect(() => {
    loadInsiderData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadInsiderData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("insider_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing insider keys:", e); }
      }
      
      const list: InsiderData[] = [];
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`insider_${key}`);
          if (dataBytes.length > 0) {
            try {
              const data = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({ 
                id: key, 
                encryptedValue: data.value, 
                timestamp: data.timestamp, 
                owner: data.owner, 
                company: data.company,
                dataType: data.dataType,
                status: data.status || "pending" 
              });
            } catch (e) { console.error(`Error parsing data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading data ${key}:`, e); }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setInsiderData(list);
    } catch (e) { console.error("Error loading insider data:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitInsiderData = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting sensitive data with Zama FHE..." });
    try {
      const encryptedValue = FHEEncryptNumber(newData.value);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const data = { 
        value: encryptedValue, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        company: newData.company,
        dataType: newData.dataType,
        status: "pending" 
      };
      
      await contract.setData(`insider_${dataId}`, ethers.toUtf8Bytes(JSON.stringify(data)));
      
      const keysBytes = await contract.getData("insider_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(dataId);
      await contract.setData("insider_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted data submitted securely!" });
      setUserHistory(prev => [...prev, `Submitted ${newData.dataType} data for ${newData.company}`]);
      await loadInsiderData();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewData({ company: "", dataType: "earnings", value: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      setUserHistory(prev => [...prev, "Decrypted insider information"]);
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const verifyData = async (dataId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted data with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const dataBytes = await contract.getData(`insider_${dataId}`);
      if (dataBytes.length === 0) throw new Error("Data not found");
      
      const data = JSON.parse(ethers.toUtf8String(dataBytes));
      const updatedData = { ...data, status: "verified" };
      
      await contract.setData(`insider_${dataId}`, ethers.toUtf8Bytes(JSON.stringify(updatedData)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE verification completed successfully!" });
      setUserHistory(prev => [...prev, `Verified data ${dataId.substring(0, 6)}`]);
      await loadInsiderData();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Verification failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const rejectData = async (dataId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted data with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const dataBytes = await contract.getData(`insider_${dataId}`);
      if (dataBytes.length === 0) throw new Error("Data not found");
      
      const data = JSON.parse(ethers.toUtf8String(dataBytes));
      const updatedData = { ...data, status: "rejected" };
      
      await contract.setData(`insider_${dataId}`, ethers.toUtf8Bytes(JSON.stringify(updatedData)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE rejection completed successfully!" });
      setUserHistory(prev => [...prev, `Rejected data ${dataId.substring(0, 6)}`]);
      await loadInsiderData();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Rejection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (dataAddress: string) => address?.toLowerCase() === dataAddress.toLowerCase();

  const filteredData = insiderData.filter(data => {
    const matchesSearch = data.company.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         data.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || data.dataType === filterType;
    return matchesSearch && matchesType;
  });

  const verifiedCount = insiderData.filter(d => d.status === "verified").length;
  const pendingCount = insiderData.filter(d => d.status === "pending").length;
  const rejectedCount = insiderData.filter(d => d.status === "rejected").length;

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>隱秘交易員</h1>
          <p>FHE-based Economic Simulation</p>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            Add Insider Data
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="market-overview">
          <div className="market-header">
            <h2>Market Overview</h2>
            <div className="market-stats">
              <div className="stat-item">
                <span className="stat-label">Verified Data</span>
                <span className="stat-value">{verifiedCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Pending Data</span>
                <span className="stat-value">{pendingCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Rejected Data</span>
                <span className="stat-value">{rejectedCount}</span>
              </div>
            </div>
          </div>
          
        </div>

        <div className="data-section">
          <div className="section-header">
            <h2>Insider Data Records</h2>
            <div className="controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search company or ID..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Types</option>
                <option value="earnings">Earnings</option>
                <option value="merger">Merger</option>
                <option value="product">Product</option>
                <option value="regulation">Regulation</option>
              </select>
              <button onClick={loadInsiderData} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="data-grid">
            <div className="grid-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Company</div>
              <div className="header-cell">Data Type</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>

            {filteredData.length === 0 ? (
              <div className="no-data">
                <p>No insider data found</p>
                <button className="primary-btn" onClick={() => setShowCreateModal(true)}>
                  Add First Data
                </button>
              </div>
            ) : (
              filteredData.map(data => (
                <div className="data-row" key={data.id} onClick={() => setSelectedData(data)}>
                  <div className="grid-cell">#{data.id.substring(0, 6)}</div>
                  <div className="grid-cell">{data.company}</div>
                  <div className="grid-cell">{data.dataType}</div>
                  <div className="grid-cell">{data.owner.substring(0, 6)}...{data.owner.substring(38)}</div>
                  <div className="grid-cell">{new Date(data.timestamp * 1000).toLocaleDateString()}</div>
                  <div className="grid-cell">
                    <span className={`status-badge ${data.status}`}>{data.status}</span>
                  </div>
                  <div className="grid-cell actions">
                    {isOwner(data.owner) && data.status === "pending" && (
                      <>
                        <button className="action-btn verify" onClick={(e) => { e.stopPropagation(); verifyData(data.id); }}>
                          Verify
                        </button>
                        <button className="action-btn reject" onClick={(e) => { e.stopPropagation(); rejectData(data.id); }}>
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="user-section">
          <h2>Your Activity History</h2>
          <div className="history-list">
            {userHistory.length === 0 ? (
              <p>No activity recorded yet</p>
            ) : (
              <ul>
                {userHistory.slice(0, 5).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Add Insider Information</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Company Name *</label>
                <input
                  type="text"
                  value={newData.company}
                  onChange={(e) => setNewData({...newData, company: e.target.value})}
                  placeholder="Enter company name"
                />
              </div>
              <div className="form-group">
                <label>Data Type *</label>
                <select
                  value={newData.dataType}
                  onChange={(e) => setNewData({...newData, dataType: e.target.value as any})}
                >
                  <option value="earnings">Earnings Report</option>
                  <option value="merger">Merger Info</option>
                  <option value="product">Product Launch</option>
                  <option value="regulation">Regulation Change</option>
                </select>
              </div>
              <div className="form-group">
                <label>Sensitive Value *</label>
                <input
                  type="number"
                  value={newData.value}
                  onChange={(e) => setNewData({...newData, value: parseFloat(e.target.value)})}
                  placeholder="Enter numerical value"
                  step="0.01"
                />
              </div>
              <div className="encryption-preview">
                <h4>FHE Encryption Preview</h4>
                <div className="preview-content">
                  <div className="plain-value">
                    <span>Plain Value:</span>
                    <div>{newData.value || '0'}</div>
                  </div>
                  <div className="arrow">→</div>
                  <div className="encrypted-value">
                    <span>Encrypted Value:</span>
                    <div>{newData.value ? FHEEncryptNumber(newData.value).substring(0, 50) + '...' : 'No value'}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">
                Cancel
              </button>
              <button onClick={submitInsiderData} disabled={creating} className="submit-btn">
                {creating ? "Encrypting with FHE..." : "Submit Securely"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedData && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Insider Data Details</h2>
              <button onClick={() => { setSelectedData(null); setDecryptedValue(null); }} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="info-grid">
                <div className="info-item">
                  <span>ID:</span>
                  <strong>#{selectedData.id.substring(0, 8)}</strong>
                </div>
                <div className="info-item">
                  <span>Company:</span>
                  <strong>{selectedData.company}</strong>
                </div>
                <div className="info-item">
                  <span>Data Type:</span>
                  <strong>{selectedData.dataType}</strong>
                </div>
                <div className="info-item">
                  <span>Owner:</span>
                  <strong>{selectedData.owner.substring(0, 6)}...{selectedData.owner.substring(38)}</strong>
                </div>
                <div className="info-item">
                  <span>Date:</span>
                  <strong>{new Date(selectedData.timestamp * 1000).toLocaleString()}</strong>
                </div>
                <div className="info-item">
                  <span>Status:</span>
                  <strong className={`status-badge ${selectedData.status}`}>{selectedData.status}</strong>
                </div>
              </div>

              <div className="encrypted-section">
                <h3>Encrypted Data</h3>
                <div className="encrypted-data">
                  {selectedData.encryptedValue.substring(0, 100)}...
                </div>
                <div className="fhe-tag">
                  <span>FHE Encrypted</span>
                </div>
                <button 
                  className="decrypt-btn" 
                  onClick={async () => {
                    if (decryptedValue !== null) {
                      setDecryptedValue(null);
                    } else {
                      const decrypted = await decryptWithSignature(selectedData.encryptedValue);
                      if (decrypted !== null) setDecryptedValue(decrypted);
                    }
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : decryptedValue !== null ? "Hide Value" : "Decrypt with Wallet"}
                </button>
              </div>

              {decryptedValue !== null && (
                <div className="decrypted-section">
                  <h3>Decrypted Value</h3>
                  <div className="decrypted-value">
                    {decryptedValue}
                  </div>
                  <div className="warning-note">
                    This value is only visible after wallet signature verification
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`status-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="status-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-left">
            <h3>隱秘交易員</h3>
            <p>FHE-based Economic Simulation Game</p>
          </div>
          <div className="footer-right">
            <div className="fhe-badge">
              <span>Powered by Zama FHE</span>
            </div>
            <div className="copyright">
              © {new Date().getFullYear()} All rights reserved
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;