import { Component } from 'react'

// Poslední záchrana: když cokoli v aplikaci spadne, místo mrtvé obrazovky
// nabídneme obnovení. Uložená hra zůstává v localStorage netknutá.
// Texty jsou natvrdo dvojjazyčně — i18n kontext může být tou chybou zasažen.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="party-bg flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-4xl font-black">
          <span className="bg-gradient-to-r from-neon-pink to-neon-cyan bg-clip-text text-transparent">Ой!</span>
        </p>
        <p className="max-w-md text-sm leading-relaxed text-white/65">
          Щось зламалося, але гра збережена — онови сторінку.
          <br />
          Něco se pokazilo, ale hra je uložená — obnov stránku.
        </p>
        <button onClick={() => window.location.reload()} className="btn-primary">
          Оновити / Obnovit
        </button>
      </div>
    )
  }
}
