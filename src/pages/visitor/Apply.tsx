import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { Notice } from '../../components/ui'
import { AuthShell } from '../auth/parts'

/**
 * Two short forms for the organizers of a future event: "I want a booth" and "I want to run my
 * event on this app". Open to anyone, signed in or not — filing one grants nothing. Rows land in
 * `applications`, which firestore.rules lets anyone create (shape-checked) and only admins read.
 */
type Kind = 'exhibitor' | 'admin'

const COPY: Record<Kind, { title: string; lead: string; send: string }> = {
  exhibitor: {
    title: 'Become an exhibitor',
    lead: 'Run a booth that stamps visitors’ digital passports. Tell us about your booth and we will get back to you by email.',
    send: 'Send request',
  },
  admin: {
    title: 'Become an admin',
    lead: 'Run your own event on the InterFest Passport: booths, stamps, prizes and live stats. Tell us about your event and we will get back to you by email.',
    send: 'Send request',
  },
}

export default function Apply({ kind }: { kind: Kind }) {
  const c = COPY[kind]
  const [f, setF] = useState({ name: '', email: '', org: '', event: '', booth: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const email = f.email.trim()
  const ok = !!f.name.trim() && /.+@.+\..+/.test(email) && !!f.org.trim() && !!f.event.trim() && (kind === 'admin' || !!f.booth.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true); setErr(null)
    try {
      await addDoc(collection(db, 'applications'), {
        kind,
        name: f.name.trim(),
        email,
        org: f.org.trim(),
        event: f.event.trim(),
        ...(kind === 'exhibitor' ? { booth: f.booth.trim() } : {}),
        message: f.message.trim(),
        createdAt: serverTimestamp(),
      })
      setDone(true)
    } catch {
      setErr('Your request did not send. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <AuthShell eventLine={false} title="Request sent" lead={`Thank you, ${f.name.trim()}. We will reply to ${email}.`}>
        <a href="/" className="btn-primary mt-5 block py-3 text-center">Back to the passport</a>
      </AuthShell>
    )
  }

  const field = (k: keyof typeof f, label: string, opts: { type?: string; placeholder?: string; optional?: boolean; max?: number } = {}) => (
    <div className="mt-4">
      <label htmlFor={`ap-${k}`} className="mb-1 block text-xs font-medium text-ink-soft">{label}{opts.optional ? ' (optional)' : ''}</label>
      <input id={`ap-${k}`} className="field" type={opts.type ?? 'text'} value={f[k]} onChange={set(k)} maxLength={opts.max ?? 120} placeholder={opts.placeholder} autoComplete={k === 'email' ? 'email' : k === 'name' ? 'name' : 'off'} />
    </div>
  )

  return (
    <AuthShell eventLine={false} title={c.title} lead={c.lead}>
      <form onSubmit={submit} noValidate>
        {err && <div className="mt-4"><Notice tone="red">{err}</Notice></div>}
        {field('name', 'Your name')}
        {field('email', 'Email', { type: 'email', placeholder: 'name@example.com', max: 200 })}
        {field('org', 'Organization, school or club', { max: 200 })}
        {field('event', 'Event name', { placeholder: 'e.g. MFU Open House 2027', max: 200 })}
        {kind === 'exhibitor' && field('booth', 'Booth name')}
        <div className="mt-4">
          <label htmlFor="ap-message" className="mb-1 block text-xs font-medium text-ink-soft">Message (optional)</label>
          <textarea id="ap-message" className="field min-h-24" value={f.message} onChange={set('message')} maxLength={1000}
            placeholder={kind === 'exhibitor' ? 'What will visitors do at your booth?' : 'Dates, number of booths, anything else'} />
        </div>
        <button type="submit" className="btn-primary mt-5 w-full py-3" disabled={!ok || busy}>{busy ? 'Sending…' : c.send}</button>
      </form>
    </AuthShell>
  )
}
