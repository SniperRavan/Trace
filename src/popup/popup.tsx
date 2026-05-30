/**
 * src/popup/popup.tsx
 * Entry point for the extension's toolbar popup.
 * Phase 1 stub — shows Trace branding + placeholder.
 */

import { createRoot } from 'react-dom/client'

function PopupApp() {
  return (
    <div style={{
      padding:    '20px',
      color:      'rgba(255,255,255,0.7)',
      fontSize:   '13px',
      textAlign:  'center',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        fontSize:     '18px',
        fontWeight:   '500',
        color:        'rgba(255,255,255,0.85)',
        marginBottom: '8px',
        letterSpacing: '-0.3px',
      }}>
        trace
      </div>
      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px' }}>
        ambient AI usage tracker
      </div>
      <div style={{
        marginTop:     '20px',
        padding:       '12px',
        background:    'rgba(255,255,255,0.04)',
        borderRadius:  '10px',
        border:        '0.5px solid rgba(255,255,255,0.08)',
        color:         'rgba(255,255,255,0.3)',
        fontSize:      '11px',
        lineHeight:    '1.6',
      }}>
        Visit a supported AI provider<br />to begin tracking.
      </div>
    </div>
  )
}

const root = document.getElementById('root')!
createRoot(root).render(<PopupApp />)
