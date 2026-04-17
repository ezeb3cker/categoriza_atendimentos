import { useState, useEffect, useRef } from 'react'
import './App.css'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'

const API_BASE = 'https://dev.gruponfa.com/webhook'
const FIXED_CATEGORIES = ['Aguardando atendimento', 'Em atendimento', 'Convertido', 'Perdido']

/** Alertas conforme WlExtension (Chatlabel): https://github.com/chatlabel/extension-php */
function extensionAlert(message, variant = 'warning') {
  const Wl = typeof window !== 'undefined' ? window.WlExtension : undefined
  if (Wl && typeof Wl.alert === 'function') {
    Wl.alert({ message, variant })
    return
  }
  window.alert(message)
}

function App() {
  const [systemKey, setSystemKey] = useState(null)
  const [attendanceId, setAttendanceId] = useState(null)
  const [attendanceData, setAttendanceData] = useState(null) // payload completo do onOpenAttendance
  const [hasOpenAttendance, setHasOpenAttendance] = useState(false)

  const [leadLoading, setLeadLoading] = useState(false)
  const [leadError, setLeadError] = useState('')
  const [leadData, setLeadData] = useState(null)
  const [noCampaignData, setNoCampaignData] = useState(false)

  const [statusAtendimento, setStatusAtendimento] = useState('')
  const [initialStatusAtendimento, setInitialStatusAtendimento] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)

  const stateRef = useRef({ setAttendanceId, setAttendanceData, setHasOpenAttendance })
  stateRef.current = { setAttendanceId, setAttendanceData, setHasOpenAttendance }

  // Conforme doc https://github.com/chatlabel/extension-php: getInfoUser retorna userId e systemId
  // Registra eventos onOpenAttendance e onCloseAttendance para o parent (Chatlabel) invocar
  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const maxAttempts = 50

    function tryInit() {
      if (cancelled) return
      const Wl = window.WlExtension
      if (typeof Wl === 'undefined' || !Wl.getInfoUser) {
        attempts += 1
        if (attempts < maxAttempts) setTimeout(tryInit, 100)
        return
      }

      Wl.getInfoUser()
        .then((data) => {
          if (cancelled) return
          // Doc: "retorna um objeto com userId e systemId" — exemplo também cita systemKey
          const key = (data && (data.systemId ?? data.systemKey)) || null
          if (key) setSystemKey(String(key))
        })
        .catch(() => {
          if (!cancelled) setSystemKey(null)
        })

      if (Wl.initialize) {
        Wl.initialize({
          buttons: {},
          events: {
            onOpenAttendance(attendance) {
              console.log('onOpenAttendance payload:', attendance)
              const ref = stateRef.current
              const id = attendance && (attendance.atendimentoId ?? attendance.attendanceId ?? attendance.id)
              if (ref.setAttendanceId) ref.setAttendanceId(id ?? null)
              if (ref.setAttendanceData) ref.setAttendanceData(attendance || null)
              if (ref.setHasOpenAttendance) ref.setHasOpenAttendance(true)
            },
            onCloseAttendance() {
              const ref = stateRef.current
              if (ref.setHasOpenAttendance) ref.setHasOpenAttendance(false)
              if (ref.setAttendanceId) ref.setAttendanceId(null)
              if (ref.setAttendanceData) ref.setAttendanceData(null)
            },
          },
        })
      }
    }

    tryInit()
    return () => { cancelled = true }
  }, [])

  const chatCodigo =
    (attendanceData && (attendanceData.atendimentoId ?? attendanceData.attendanceId ?? attendanceData.id)) ||
    (attendanceData && attendanceData.chat && (attendanceData.chat.codigo || attendanceData.chat.id)) ||
    (attendanceData && (attendanceData.chatCodigo ?? attendanceData.chatId)) ||
    attendanceId ||
    null

  const openedAttendanceKey = String(chatCodigo || '')

  useEffect(() => {
    if (!hasOpenAttendance) {
      setLeadLoading(false)
      setLeadError('')
      setLeadData(null)
      setNoCampaignData(false)
      setStatusAtendimento('')
      setInitialStatusAtendimento('')
      return
    }

    if (!systemKey || !openedAttendanceKey) return

    let cancelled = false
    setLeadLoading(true)
    setLeadError('')
    setLeadData(null)
    setNoCampaignData(false)
    setInitialStatusAtendimento('')

    fetch(`${API_BASE}/extension/search-source-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'chat.codigo': openedAttendanceKey,
        systemKey: String(systemKey),
      }),
    })
      .then(async (res) => {
        let data = null
        try {
          data = await res.json()
        } catch {
          data = null
        }
        if (!res.ok) {
          const msg = (data && data.message) || res.statusText || 'Falha ao buscar dados do atendimento'
          throw new Error(msg)
        }
        return data
      })
      .then((data) => {
        if (cancelled) return
        const normalized =
          Array.isArray(data) ? (data[0] && typeof data[0] === 'object' ? data[0] : null)
          : (data && typeof data === 'object' ? data : null)

        const hasLead = !!(normalized && normalized._id)

        if (!hasLead) {
          setLeadData(null)
          setNoCampaignData(true)
          setStatusAtendimento('')
          setInitialStatusAtendimento('')
          return
        }

        setLeadData(normalized)
        const loadedStatus = normalized?.status?.atendimento ? String(normalized.status.atendimento) : ''
        setInitialStatusAtendimento(loadedStatus)
        setStatusAtendimento(loadedStatus)
      })
      .catch((err) => {
        if (cancelled) return
        setLeadError(err?.message ? String(err.message) : 'Falha ao buscar dados do atendimento')
      })
      .finally(() => {
        if (!cancelled) setLeadLoading(false)
      })

    return () => { cancelled = true }
  }, [hasOpenAttendance, systemKey, openedAttendanceKey])

  const saveChanges = async () => {
    const status = statusAtendimento.trim()
    const nextStatus = status || 'Não especificado'

    const leadId = leadData?._id ? String(leadData._id) : ''
    const chatCode = leadData?.chat?.codigo ? String(leadData.chat.codigo) : openedAttendanceKey

    if (!systemKey) {
      extensionAlert('Sistema não identificado.', 'warning')
      return
    }

    if (!leadId || !chatCode) {
      extensionAlert('Dados insuficientes para salvar (aguarde carregar o atendimento).', 'warning')
      return
    }

    setSaveLoading(true)
    try {
      const body = {
        _id: leadId,
        systemKey: String(systemKey),
        'chat.codigo': chatCode,
        status: nextStatus,
      }

      const res = await fetch(`${API_BASE}/extension/update-category-lead-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (!res.ok) {
        const msg = (data && data.message) || res.statusText || 'Falha ao salvar'
        throw new Error(msg)
      }

      extensionAlert('Alterações salvas.', 'success')
    } catch (err) {
      extensionAlert('Erro ao salvar: ' + (err?.message || 'Tente novamente.'), 'error')
    } finally {
      setSaveLoading(false)
    }
  }

  const dropdownOptions = [
    { value: '', label: 'Selecione o status' },
    ...FIXED_CATEGORIES.map((c) => ({ value: c, label: c })),
  ]

  const photoUrl =
    (attendanceData && (attendanceData.linkImagem || attendanceData.contato?.linkImagem)) ||
    ''

  const displayName =
    leadData?.contato?.nome ||
    attendanceData?.descricao ||
    attendanceData?.contato?.nome ||
    '-'

  const displayNumber =
    leadData?.contato?.numero ||
    attendanceData?.contato?.numero ||
    '-'

  const displayCompany =
    leadData?.empresa?.nome ||
    attendanceData?.organizacao?.nome ||
    '-'

  const displayChannel =
    leadData?.canal?.nome ||
    attendanceData?.canal?.descricao ||
    '-'

  const displayCampaignOrigin = leadData?.campanha?.origemLead || '-'
  const displayCampaignMessage = leadData?.campanha?.campanhaMessage || '-'

  const canSave =
    !saveLoading &&
    statusAtendimento.trim() !== '' &&
    statusAtendimento.trim() !== initialStatusAtendimento.trim()

  return (
    <div className="app">
      {!hasOpenAttendance && (
        <main className="main">
          <div className="emptyState">
            <div className="emptyIcon" aria-hidden="true">
              <HomeOutlinedIcon fontSize="inherit" />
            </div>
            <p className="emptyTitle">Nenhum atendimento aberto</p>
            <p className="emptySubtitle">Abra um atendimento para visualizar os dados e ajustar status/categoria.</p>
          </div>
        </main>
      )}

      {hasOpenAttendance && (
        <main className="main">
          {leadLoading ? (
            <div className="emptyState">
              <div className="spinner" aria-hidden="true" />
              <p className="emptyTitle">Verificando campanha…</p>
              <p className="emptySubtitle">Aguarde enquanto buscamos os dados do atendimento.</p>
            </div>
          ) : !!leadError ? (
            <div className="emptyState">
              <div className="emptyIcon" aria-hidden="true">
                <HomeOutlinedIcon fontSize="inherit" />
              </div>
              <p className="emptyTitle">Não foi possível carregar</p>
              <p className="emptySubtitle">{leadError}</p>
            </div>
          ) : noCampaignData ? (
            <div className="emptyState">
              <div className="emptyIcon" aria-hidden="true">
                <HomeOutlinedIcon fontSize="inherit" />
              </div>
              <p className="emptyTitle">Atendimento sem campanha</p>
              <p className="emptySubtitle">Este atendimento não foi aberto a partir de uma campanha.</p>
            </div>
          ) : (
            <>
              <section className="profileCard">
                <div className="profileRow">
                  <div className="avatarWrap" aria-hidden="true">
                    {photoUrl ? (
                      <img className="avatarImg" src={photoUrl} alt="" />
                    ) : (
                      <div className="avatarFallback" />
                    )}
                  </div>
                  <div className="profileInfo">
                    <p className="profileName">{displayName}</p>
                    <p className="profileSub">{displayNumber}</p>
                  </div>
                </div>
              </section>

              <section className="detailsCard">
                <p className="detailsTitle">Atendimento</p>
                <div className="kvGrid">
                  <div className="kvItem">
                    <span className="kvLabel">Empresa</span>
                    <span className="kvValue">{displayCompany}</span>
                  </div>
                  <div className="kvItem">
                    <span className="kvLabel">Canal</span>
                    <span className="kvValue">{displayChannel}</span>
                  </div>
                  <div className="kvItem">
                    <span className="kvLabel">Campanha</span>
                    <span className="kvValue">{displayCampaignMessage}</span>
                  </div>
                  <div className="kvItem">
                    <span className="kvLabel">Origem</span>
                    <span className="kvValue">{displayCampaignOrigin}</span>
                  </div>
                </div>
              </section>

              <section className="detailsCard">
                <p className="detailsTitle">Status do atendimento</p>
                <select
                  id="statusAtendimento"
                  className="select"
                  value={statusAtendimento}
                  onChange={(e) => setStatusAtendimento(e.target.value)}
                >
                  {dropdownOptions.map((opt) => (
                    <option key={opt.value || 'empty'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </section>

              <button
                type="button"
                className="btnSubmit"
                onClick={saveChanges}
                disabled={!canSave}
              >
                {saveLoading ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </>
          )}
        </main>
      )}
    </div>
  )
}

export default App
