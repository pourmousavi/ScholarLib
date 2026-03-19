import { useState } from 'react'
import { Btn, Tag, StatusDot, ConfBar, Input, Modal, ToastContainer, Spinner } from './components/ui'
import { useToast, useToastStore } from './hooks/useToast'

function ComponentShowcase() {
  const [showModal, setShowModal] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const { showToast } = useToast()

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", color: 'var(--accent)', fontSize: 28, marginBottom: 32 }}>
        ScholarLib — Component Showcase
      </h1>

      {/* Buttons */}
      <Section title="Buttons">
        <Btn>Default Button</Btn>
        <Btn gold>Gold Button</Btn>
        <Btn small>Small Button</Btn>
        <Btn gold small>Gold Small</Btn>
        <Btn disabled>Disabled</Btn>
      </Section>

      {/* Tags */}
      <Section title="Tags">
        <Tag label="BESS" />
        <Tag label="degradation" />
        <Tag label="removable" onRemove={() => showToast({ message: 'Tag removed', type: 'info' })} />
      </Section>

      {/* Status Dots */}
      <Section title="Status Dots">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status="indexed" /> Indexed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status="pending" /> Pending
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status="processing" /> Processing
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status="none" /> None
          </span>
        </div>
      </Section>

      {/* Confidence Bars */}
      <Section title="Confidence Bars">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ConfBar value={95} /> 95%
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ConfBar value={78} /> 78%
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ConfBar value={45} /> 45%
          </span>
        </div>
      </Section>

      {/* Inputs */}
      <Section title="Inputs">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 300 }}>
          <Input
            placeholder="Text input..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <Input
            multiline
            rows={3}
            placeholder="Multiline textarea..."
          />
        </div>
      </Section>

      {/* Spinner */}
      <Section title="Spinner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Spinner size={16} />
          <Spinner size={24} />
          <Spinner size={32} color="var(--success)" />
        </div>
      </Section>

      {/* Modal Trigger */}
      <Section title="Modal">
        <Btn onClick={() => setShowModal(true)}>Open Modal</Btn>
      </Section>

      {/* Toast Triggers */}
      <Section title="Toasts">
        <Btn onClick={() => showToast({ message: 'Document indexed successfully', type: 'success' })}>
          Success Toast
        </Btn>
        <Btn onClick={() => showToast({ message: 'Failed to connect to Ollama', type: 'error' })}>
          Error Toast
        </Btn>
        <Btn onClick={() => showToast({ message: 'API rate limit approaching', type: 'warning' })}>
          Warning Toast
        </Btn>
        <Btn onClick={() => showToast({ message: 'Processing document...', type: 'info' })}>
          Info Toast
        </Btn>
      </Section>

      {/* Modal */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)} width={500}>
          <div style={{ padding: 24 }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", color: 'var(--text-primary)', marginBottom: 16 }}>
              Modal Title
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              This is a modal dialog. Click outside or press Escape to close.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn gold onClick={() => setShowModal(false)}>Confirm</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        color: 'var(--text-faint)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        marginBottom: 12
      }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function ToastProvider({ children }) {
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)

  return (
    <>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ComponentShowcase />
    </ToastProvider>
  )
}
