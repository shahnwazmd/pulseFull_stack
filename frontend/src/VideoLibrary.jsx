// src/VideoLibrary.jsx
import React, { useEffect, useState } from "react";
import VideoPlayer from "./VideoPlayer";
import { useAuth } from './context/useAuth.jsx';
import { readableBytes, getStatusColor } from "./utils/formatUtils";

const SERVER_BASE = import.meta.env.VITE_SERVER_BASE || "http://localhost:4000";

export default function VideoLibrary() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playerVideo, setPlayerVideo] = useState(null);
  const { getAuthHeaders } = useAuth();

  async function fetchVideos() {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const resp = await fetch(`${SERVER_BASE}/api/videos`, {
        headers
      });
      
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();

      console.log("Fetched videos:", json);
      setVideos(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("❌ Failed to fetch videos:", err);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchVideos();
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Video Library</h2>
    
      </div>

      <div style={styles.actions}>
        <button onClick={fetchVideos} style={styles.refreshBtn}>
          <i className="fas fa-sync-alt" style={{marginRight: '6px'}}></i>
          Refresh
        </button>
      </div>

      {loading && <div style={styles.note}>Loading your videos...</div>}
      {!loading && videos.length === 0 && (
        <div style={styles.emptyState}>
          <i className="fas fa-video-slash" style={{fontSize: '48px', color: '#64748b', marginBottom: '16px'}}></i>
          <h3>No videos yet</h3>
          <p>Upload your first video to get started</p>
        </div>
      )}

      <div style={styles.grid}>
        {videos.map((v) => (
          <div key={v.videoId} style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.name}>{v.originalName || v.filename}</div>
              <div style={styles.size}>{readableBytes(v.size)}</div>
            </div>

            <div style={styles.cardBody}>
              <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
                Status: 
                <strong style={{color: getStatusColor(v.status)}}>
                  {v.status}
                </strong>
              </div>
              <div>
                Uploaded: {new Date(v.createdAt).toLocaleString()}
              </div>
              {v.processingStage === 'processing' && (
                <div style={styles.processing}>
                  <div style={styles.progressBar}>
                    <div 
                      style={{
                        ...styles.progressFill,
                        width: `${v.processingPercent || 0}%`
                      }}
                    ></div>
                  </div>
                  <span>{v.processingPercent || 0}% processed</span>
                </div>
              )}
            </div>

            <div style={styles.cardFooter}>
              <button 
                onClick={() => setPlayerVideo(v)} 
                style={styles.playBtn}
                disabled={v.status !== 'ready'}
              >
                <i className="fas fa-play" style={{marginRight: '6px'}}></i>
                Play
              </button>
              
            </div>
          </div>
        ))}
      </div>

      {playerVideo && (
        <VideoPlayer
          video={playerVideo}
          onClose={() => setPlayerVideo(null)}
        />
      )}

     
    </div>
  );
}

const styles = {
  container: {
    width: "92%",
    maxWidth: 1100,
    margin: "20px auto",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial",
  },
  
  header: {
    marginBottom: '20px'
  },
  title: { 
    fontSize: 22, 
    marginBottom: 4,
    color: '#1e293b'
  },
  subtitle: {
    color: '#64748b',
    fontSize: '14px'
  },
  actions: { 
    display: "flex", 
    justifyContent: "flex-end", 
    marginBottom: 20 
  },
  refreshBtn: {
    padding: '8px 16px',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  note: { 
    color: "#666", 
    marginBottom: 10,
    textAlign: 'center',
    padding: '20px'
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#64748b'
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
    gap: 16,
  },
  card: {
    padding: 16,
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    border: '1px solid #e5e7eb'
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  },
  name: { 
    fontWeight: 600,
    color: '#1e293b'
  },
  size: { 
    color: "#666", 
    fontSize: 13 
  },
  cardBody: { 
    fontSize: 13, 
    color: "#444", 
    marginBottom: 12 
  },
  processing: {
    marginTop: '8px',
    fontSize: '12px'
  },
  progressBar: {
    width: '100%',
    height: '6px',
    backgroundColor: '#e5e7eb',
    borderRadius: '3px',
    marginBottom: '4px'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: '3px',
    transition: 'width 0.3s'
  },
  cardFooter: { 
    display: "flex", 
    gap: 8 
  },
  playBtn: {
    padding: '6px 12px',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px'
  },
  downloadBtn: {
    padding: '6px 12px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    textDecoration: 'none'
  },
  securityNotice: {
    marginTop: '40px',
    padding: '16px',
    background: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center'
  }
};