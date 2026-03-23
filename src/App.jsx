import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CloseIcon from '@mui/icons-material/Close'
import CheckIcon from '@mui/icons-material/Check'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'

const API_BASE = 'https://dev.gruponfa.com/webhook'
const REASONS_PAGE_SIZE = 10
const CATEGORIES_CACHE_PREFIX = 'categorize-care-categories-'
const REQUIRED_REASONS = ['Agendou', 'Não agendou']

// Busca categorias/categorias: GET com systemId na query (navegadores não enviam body em GET)
// Response: [{ _id, systemId, category }, ...]
async function searchCategories(systemId) {
  const id = systemId ? String(systemId).trim() : ''
  const url = `${API_BASE}/search/categorize-attendance?systemId=${encodeURIComponent(id)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error('Falha na busca')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

function normalizeReasonName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function isRequiredReasonName(name) {
  const n = normalizeReasonName(name)
  return REQUIRED_REASONS.some((r) => normalizeReasonName(r) === n)
}

async function createCategory(systemId, category) {
  const res = await fetch(`${API_BASE}/create/cetegorize-attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemId, category }),
  })
  if (!res.ok) throw new Error(res.statusText || 'Falha ao salvar')
  return res
}

async function ensureRequiredReasons(systemId, existingList) {
  const systemKey = systemId ? String(systemId).trim() : ''
  if (!systemKey) return Array.isArray(existingList) ? existingList : []

  const list = Array.isArray(existingList) ? existingList : await searchCategories(systemKey)
  const existingNames = new Set(
    list.map((item) => normalizeReasonName(typeof item === 'object' ? item?.category : item))
  )

  const missing = REQUIRED_REASONS.filter((r) => !existingNames.has(normalizeReasonName(r)))
  if (missing.length === 0) return list

  // cria os que faltam e recarrega para garantir ids retornados pela API
  for (const reason of missing) {
    try {
      await createCategory(systemKey, reason)
    } catch {
      // se falhar aqui, ainda tentamos seguir com o que houver no backend
    }
  }

  try {
    return await searchCategories(systemKey)
  } catch {
    return list
  }
}

function App() {
  const [systemKey, setSystemKey] = useState(null)
  const [attendanceId, setAttendanceId] = useState(null)
  const [attendanceData, setAttendanceData] = useState(null) // payload completo do onOpenAttendance
  const [hasOpenAttendance, setHasOpenAttendance] = useState(false)
  const [categories, setCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [isManageScreenVisible, setIsManageScreenVisible] = useState(false)
  const [reasonsList, setReasonsList] = useState([])
  const [reasonsPage, setReasonsPage] = useState(1)
  const [reasonsLoading, setReasonsLoading] = useState(false)
  const [newReasonFormVisible, setNewReasonFormVisible] = useState(false)
  const [newReasonInput, setNewReasonInput] = useState('')
  const [saveReasonLoading, setSaveReasonLoading] = useState(false)
  const [editingReasonId, setEditingReasonId] = useState(null)
  const [editingReasonName, setEditingReasonName] = useState('')
  const [deletingReasonId, setDeletingReasonId] = useState(null)
  const [resultadoAtendimento, setResultadoAtendimento] = useState('')
  const [observacao, setObservacao] = useState('')
  const [sendCloseMessage, setSendCloseMessage] = useState(true)
  const [sendSatisfactionSurvey, setSendSatisfactionSurvey] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  const stateRef = useRef({ setAttendanceId, setAttendanceData, setHasOpenAttendance })
  stateRef.current = { setAttendanceId, setAttendanceData, setHasOpenAttendance }

  const fetchCategories = useCallback(async () => {
    if (!systemKey) return []
    const list = await searchCategories(systemKey)
    return ensureRequiredReasons(systemKey, list)
  }, [systemKey])

  const loadCategoriesForForm = useCallback(async () => {
    if (!systemKey) return
    // Se já temos categorias em memória, ainda garantimos os obrigatórios (podem ter sido removidos no backend)
    if (categories.length > 0) {
      const ensured = await ensureRequiredReasons(systemKey, categories)
      if (ensured !== categories) {
        setCategories(ensured)
        try {
          const cacheKey = `${CATEGORIES_CACHE_PREFIX}${systemKey}`
          window.localStorage.setItem(cacheKey, JSON.stringify(ensured))
        } catch {
          // ignora erro de cache
        }
      }
      return
    }

    setCategoriesLoading(true)
    try {
      const cacheKey = `${CATEGORIES_CACHE_PREFIX}${systemKey}`

      // Tenta carregar do localStorage primeiro
      const cached = window.localStorage.getItem(cacheKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed)) {
            const ensured = await ensureRequiredReasons(systemKey, parsed)
            setCategories(ensured)
            try {
              window.localStorage.setItem(cacheKey, JSON.stringify(ensured))
            } catch {
              // ignora erro de cache
            }
            return
          }
        } catch {
          // cache inválido, ignora e segue para busca
        }
      }

      // Sem cache válido: busca na API, atualiza estado e grava em cache
      const list = await ensureRequiredReasons(systemKey)
      setCategories(list)
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(list))
      } catch {
        // se não conseguir gravar em cache, apenas segue
      }
    } catch {
      setCategories([])
    } finally {
      setCategoriesLoading(false)
    }
  }, [systemKey, categories.length])

  const loadReasonsList = useCallback(async () => {
    if (!systemKey) return
    setReasonsLoading(true)
    try {
      const list = await ensureRequiredReasons(systemKey)
      setReasonsList(list)
      setReasonsPage(1)

      // Atualiza também as categorias e o cache, para refletir novas categorias
      setCategories(list)
      try {
        const cacheKey = `${CATEGORIES_CACHE_PREFIX}${systemKey}`
        window.localStorage.setItem(cacheKey, JSON.stringify(list))
      } catch {
        // erro ao gravar cache pode ser ignorado
      }
    } catch {
      setReasonsList([])
    } finally {
      setReasonsLoading(false)
    }
  }, [systemKey])

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

  useEffect(() => {
    if (hasOpenAttendance) loadCategoriesForForm()
  }, [hasOpenAttendance, loadCategoriesForForm])

  const showManageReasons = () => {
    setIsManageScreenVisible(true)
    setNewReasonFormVisible(false)
    setNewReasonInput('')
    loadReasonsList()
  }

  const hideManageReasons = () => setIsManageScreenVisible(false)

  const saveNewReason = async () => {
    const name = newReasonInput.trim()
    if (!name || !systemKey) return
    if (isRequiredReasonName(name)) {
      alert('Esta categoria é obrigatória e já deve existir no sistema.')
      return
    }
    setSaveReasonLoading(true)
    try {
      await createCategory(systemKey, name)
      setNewReasonInput('')
      setNewReasonFormVisible(false)
      await loadReasonsList()
      if (hasOpenAttendance) await loadCategoriesForForm()
    } catch (err) {
      alert('Erro ao cadastrar categoria: ' + (err.message || 'Tente novamente.'))
    } finally {
      setSaveReasonLoading(false)
    }
  }

  const startEditReason = (item) => {
    if (!item?._id) return
    if (isRequiredReasonName(item.category)) return
    setDeletingReasonId(null)
    setEditingReasonId(item._id)
    setEditingReasonName(item.category || '')
  }

  const cancelEditReason = () => {
    setEditingReasonId(null)
    setEditingReasonName('')
  }

  const editReason = async (item) => {
    if (!item?._id) return
    if (isRequiredReasonName(item.category)) return
    const name = editingReasonName.trim()
    if (!name) return
    if (isRequiredReasonName(name)) {
      alert('Esta categoria é obrigatória e não pode ser usada como edição.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/edit/category/categorize-attendance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          systemId: systemKey,
          category: name,
        }),
      })
      if (!res.ok) throw new Error('Falha ao atualizar')
      await loadReasonsList()
      if (hasOpenAttendance) await loadCategoriesForForm()
      cancelEditReason()
    } catch {
      alert('Erro ao editar categoria. Verifique se a API de atualização está disponível.')
    }
  }

  const startDeleteReason = (item) => {
    if (!item?._id) return
    if (isRequiredReasonName(item.category)) return
    setEditingReasonId(null)
    setEditingReasonName('')
    setDeletingReasonId(item._id)
  }

  const cancelDeleteReason = () => {
    setDeletingReasonId(null)
  }

  const deleteReason = async (item) => {
    if (!item?._id) return
    if (isRequiredReasonName(item.category)) return
    try {
      const res = await fetch(`${API_BASE}/delete/category/categorize-attendance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          systemId: systemKey,
        }),
      })
      if (!res.ok) throw new Error('Falha ao excluir')
      await loadReasonsList()
      if (hasOpenAttendance) await loadCategoriesForForm()
      cancelDeleteReason()
    } catch {
      alert('Erro ao excluir. Verifique se a API de exclusão está disponível.')
    }
  }

  const submitAttendance = async () => {
    const category = resultadoAtendimento.trim() || 'Não especificado'
    const observation = observacao.trim()
    if (!systemKey || !attendanceId) {
      alert('Atendimento ou sistema não identificado.')
      return
    }
    setSubmitLoading(true)
    try {
      const a = attendanceData || {}
      const body = {
        systemId: systemKey,
        attendanceId,
        category,
        observation,
        sendCloseMessage,
        sendSatisfactionSurvey,
        setorId: a.setorId ?? a.setor?.id ?? null,
        setorNome: a.setor?.nome ?? null,
        usuarioId: a.usuarioId ?? a.usuario?.id ?? null,
        usuarioNome: a.usuario?.nome ?? a.usuario?.apelido ?? null,
        contatoId: a.contato?.id ?? null,
        contatoNome: a.contato?.nome ?? null,
        contatoNumero: a.contato?.numero ?? null,
        canalId: a.canalId ?? a.canal?.id ?? null,
        canalNome: a.canal?.descricao ?? null,
      }
      const res = await fetch(`${API_BASE}/add-attendance/categorize-attendance`, {
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
        const msg =
          (Array.isArray(data) && data[0]?.msg) ||
          res.statusText ||
          'Falha ao finalizar'
        throw new Error(msg)
      }

      // API de finalização retorna: [{ status: \"200\", msg: \"Chat finalized successfully!\" }]
      const okStatus =
        !data || !Array.isArray(data) || data[0]?.status === '200'
      if (!okStatus) {
        const msg =
          (Array.isArray(data) && data[0]?.msg) ||
          'Falha ao finalizar'
        throw new Error(msg)
      }

      setObservacao('')
      setHasOpenAttendance(false)
      setAttendanceId(null)
      setAttendanceData(null)
      if (typeof window.WlExtension !== 'undefined' && window.WlExtension.alert) {
        window.WlExtension.alert({ message: 'Atendimento finalizado com sucesso.', variant: 'success' })
      } else {
        alert('Atendimento finalizado com sucesso.')
      }
    } catch (err) {
      alert('Erro ao finalizar: ' + (err.message || 'Tente novamente.'))
    } finally {
      setSubmitLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(reasonsList.length / REASONS_PAGE_SIZE))
  const pageItems = reasonsList.slice(
    (reasonsPage - 1) * REASONS_PAGE_SIZE,
    reasonsPage * REASONS_PAGE_SIZE
  )

  const dropdownOptions = categoriesLoading
    ? [{ value: '', label: 'Carregando...' }]
    : categories.length === 0
      ? [{ value: '', label: 'Não especificado' }]
      : [
          { value: '', label: 'Selecione a categoria' },
          ...categories.map((c) => ({
            value: typeof c === 'object' ? (c.category || c._id) : c,
            label: typeof c === 'object' ? (c.category || c._id) : c,
          })),
        ]

  return (
    <div className="app">
      {!hasOpenAttendance && (
        <main className="main">
          <button type="button" className="btnManage" onClick={showManageReasons}>
            <span className="btnIcon" aria-hidden="true">
              <SettingsOutlinedIcon fontSize="small" />
            </span>
            Gerenciar Categorias
          </button>
          <div className="emptyState">
            <div className="emptyIcon" aria-hidden="true">
              <HomeOutlinedIcon fontSize="inherit" />
            </div>
            <p className="emptyTitle">Nenhum atendimento aberto</p>
            <p className="emptySubtitle">Por favor, selecione ou abra um atendimento para finalizar.</p>
          </div>
        </main>
      )}

      {hasOpenAttendance && (
        <main className="main">
          <p className="formIntro">Tem certeza que deseja encerrar esse atendimento?</p>

          <div className="field">
            <label htmlFor="resultadoAtendimento">Resultado do atendimento</label>
            <select
              id="resultadoAtendimento"
              className="select"
              value={resultadoAtendimento}
              onChange={(e) => setResultadoAtendimento(e.target.value)}
            >
              {dropdownOptions.map((opt) => (
                <option key={opt.value || 'empty'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="observacao">Observação</label>
            <textarea
              id="observacao"
              className="textarea"
              rows={4}
              placeholder="Texto livre..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>

          <div className="switches">
            <label className="switchRow">
              <span className="switchLabel">Enviar mensagem de encerramento</span>
              <div className="switchWrap">
                <input
                  type="checkbox"
                  className="switchInput"
                  checked={sendCloseMessage}
                  onChange={(e) => setSendCloseMessage(e.target.checked)}
                />
                <span className="switchSlider" />
              </div>
            </label>
            <label className="switchRow">
              <span className="switchLabel">Enviar pesquisa de satisfação</span>
              <div className="switchWrap">
                <input
                  type="checkbox"
                  className="switchInput"
                  checked={sendSatisfactionSurvey}
                  onChange={(e) => setSendSatisfactionSurvey(e.target.checked)}
                />
                <span className="switchSlider" />
              </div>
            </label>
          </div>

          <button
            type="button"
            className="btnSubmit"
            onClick={submitAttendance}
            disabled={submitLoading}
          >
            Gravar dados e finalizar atendimento
          </button>
        </main>
      )}

      {isManageScreenVisible && (
        <div className="screenOverlay">
          <div className="manageTopBar">
            <button type="button" className="btnBack" onClick={hideManageReasons}>
              <span className="btnIcon" aria-hidden="true">
                <ArrowBackIosNewIcon fontSize="inherit" />
              </span>
              Voltar para tela inicial
            </button>
          </div>
          <div className="manageContent">
            <section className="manageSection">
              <h2 className="manageSectionTitle">Cadastrar Nova Categoria</h2>
              <button type="button" className="btnNewReason" onClick={() => setNewReasonFormVisible((v) => !v)}>
                + Nova Categoria
              </button>
              {newReasonFormVisible && (
                <div className="inlineForm">
                  <input
                    type="text"
                    className="input"
                    placeholder="Digite o nome da categoria"
                    value={newReasonInput}
                    onChange={(e) => setNewReasonInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveNewReason()}
                    maxLength={200}
                  />
                  <button
                    type="button"
                    className="btnSaveReason"
                    onClick={saveNewReason}
                    disabled={saveReasonLoading || !newReasonInput.trim()}
                  >
                    Salvar
                  </button>
                </div>
              )}
            </section>
            <section className="manageSection">
              <h2 className="manageSectionTitle">Categorias cadastradas</h2>
              {!systemKey && (
                <div className="loadingInline">Conecte ao sistema para listar as categorias.</div>
              )}
              {systemKey && reasonsLoading && (
                <div className="loadingInline">Carregando...</div>
              )}
              {systemKey && !reasonsLoading && (
                <>
                  <ul className="reasonsList">
                    {pageItems.map((item) => (
                      <li key={item._id} className="reasonItem">
                        <span className="reasonName">
                          {editingReasonId === item._id ? (
                            <input
                              type="text"
                              className="input"
                              value={editingReasonName}
                              onChange={(e) => setEditingReasonName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') editReason(item)
                                if (e.key === 'Escape') cancelEditReason()
                              }}
                            />
                          ) : (
                            item.category || item._id || ''
                          )}
                        </span>
                        <div className="reasonActions">
                          {isRequiredReasonName(item.category) && (
                            <span className="reasonLock" title="Categoria obrigatória (não pode editar/excluir)">
                              <LockOutlinedIcon fontSize="inherit" />
                            </span>
                          )}
                          {(editingReasonId === item._id || deletingReasonId === item._id) ? (
                            <>
                              <button
                                type="button"
                                className="btnCancel"
                                onClick={() =>
                                  editingReasonId === item._id
                                    ? cancelEditReason()
                                    : cancelDeleteReason()
                                }
                                aria-label="Cancelar"
                              >
                                <CloseIcon fontSize="inherit" />
                              </button>
                              <button
                                type="button"
                                className="btnConfirm"
                                onClick={() =>
                                  editingReasonId === item._id
                                    ? editReason(item)
                                    : deleteReason(item)
                                }
                                aria-label="Confirmar"
                              >
                                <CheckIcon fontSize="inherit" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditReason(item)}
                                aria-label="Editar"
                                disabled={isRequiredReasonName(item.category)}
                                title={isRequiredReasonName(item.category) ? 'Categoria obrigatória' : 'Editar'}
                              >
                                <EditOutlinedIcon fontSize="inherit" />
                              </button>
                              <button
                                type="button"
                                className="btnDelete"
                                onClick={() => startDeleteReason(item)}
                                aria-label="Excluir"
                                disabled={isRequiredReasonName(item.category)}
                                title={isRequiredReasonName(item.category) ? 'Categoria obrigatória' : 'Excluir'}
                              >
                                <DeleteOutlineIcon fontSize="inherit" />
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {totalPages > 1 && (
                    <div className="pagination">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={p === reasonsPage ? 'active' : ''}
                          onClick={() => setReasonsPage(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
