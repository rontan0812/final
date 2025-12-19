import './style.css'
import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate, Link } from 'react-router-dom'

const mekeAnswer = async ( text ) => {
    const prompt = "次の文に対して、子供に返答することを前提として、優しく短く日本語で答えてください。また、選択肢は出さなくて大丈夫です" + text

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        }
    )

    const data = await res.json()
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || '返答が取得できませんでした。'
    return answer
}

const MailScheduler = (() => {
    let timerId = null
    let nextAt = null
    let frequencyMs = 0
    const listeners = new Set()

    const notify = () => {
        for (const fn of listeners) fn({ running: !!timerId, nextAt, frequencyMs })
    }

    const sendOnce = async () => {
        try {
            await fetch('http://127.0.0.1:5000/send-mail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
        } finally {
            nextAt = Date.now() + frequencyMs
            notify()
        }
    }

    return {
        start(ms) {
            if (!ms || ms <= 0) return
            frequencyMs = ms
            if (timerId) clearInterval(timerId)
            
            sendOnce()
            timerId = setInterval(sendOnce, frequencyMs)
            notify()
        },
        stop() {
            if (timerId) clearInterval(timerId)
            timerId = null
            nextAt = null
            frequencyMs = 0
            notify()
        },
        subscribe(fn) {
            listeners.add(fn)
            fn({ running: !!timerId, nextAt, frequencyMs })
            return () => listeners.delete(fn)
        }
    }
})()

const root = createRoot(document.querySelector('#root'))

function Home() {
    const navigate = useNavigate()
        const [countdown, setCountdown] = React.useState('')
        const [running, setRunning] = React.useState(false)
        const [nextAt, setNextAt] = React.useState(null)

        React.useEffect(() => {
            const unsub = MailScheduler.subscribe(({ running, nextAt }) => {
                setRunning(running)
                setNextAt(nextAt)
            })
            return unsub
        }, [])

        React.useEffect(() => {
            if (!running || !nextAt) { setCountdown(''); return }
            const tick = () => {
                const remain = Math.max(0, nextAt - Date.now())
                const totalSec = Math.ceil(remain / 1000)
                const h = Math.floor(totalSec / 3600)
                const m = Math.floor((totalSec % 3600) / 60)
                const s = totalSec % 60
                const pad = (n) => String(n).padStart(2, '0')
                setCountdown(h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`)
            }
            tick()
            const id = setInterval(tick, 1000)
            return () => clearInterval(id)
        }, [running, nextAt])
    return (
        <div style={{ padding: 24 }}>
            <h1>メニュー</h1>
                        {running && countdown && (
                            <div style={{ marginBottom: 12, fontSize: 14 }}>
                                次の送信まで: {countdown}
                            </div>
                        )}
                        <div style={{ display: 'grid', gap: 12, maxWidth: 300 }}>
                <button onClick={() => navigate('/setting')}>設定</button>
                <button onClick={() => navigate('/cradle')}>ゆりかご</button>
                <button onClick={() => navigate('/schedule')}>スケジュール設定</button>
                <button onClick={() => navigate('/talk')}>おはなし</button>
            </div>
        </div>
    )
}

function Schedule() {
    const [selectedDates, setSelectedDates] = useState([])
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [schedules, setSchedules] = useState({})
    const [selectedTimeSlots, setSelectedTimeSlots] = useState([])
    const [memo, setMemo] = useState('')
    const [executedSchedules, setExecutedSchedules] = useState(new Set())
    const [timing, setTiming] = useState(0)

    useEffect(() => {
        const savedSchedules = localStorage.getItem('kachaka-schedules')
        if (savedSchedules) {
            try {
                setSchedules(JSON.parse(savedSchedules))
            } catch (error) {
                console.error('スケジュール復元エラー:', error)
            }
        }
    }, [])

    useEffect(() => {
        localStorage.setItem('kachaka-schedules', JSON.stringify(schedules))
    }, [schedules])

    useEffect(() => {
        const checkSchedules = () => {
            const now = new Date()
            const currentDate = formatDate(now)
            const currentHour = now.getHours()
            const currentMinute = now.getMinutes()
            const currentTimeKey = `${currentDate}-${currentHour}:${currentMinute}`

            if (schedules[currentDate]) {
                const todaySchedules = Array.isArray(schedules[currentDate]) 
                    ? schedules[currentDate] 
                    : [schedules[currentDate]]

                todaySchedules.forEach((schedule, index) => {
                    const scheduleKey = `${currentTimeKey}-${index}`
                    
                    if (!executedSchedules.has(scheduleKey)) {
                        const match = schedule.match(/\[(\d{2}):(\d{2}), (\d{2}):(\d{2})\]/)
                        if (match) {
                            const startHour = parseInt(match[1])
                            const startMinute = parseInt(match[2])
                            const endHour = parseInt(match[3])
                            const endMinute = parseInt(match[4])
                            
                            const currentTotalMinutes = currentHour * 60 + currentMinute
                            const startTotalMinutes = startHour * 60 + startMinute
                            const endTotalMinutes = endHour * 60 + endMinute
                            
                            if (currentTotalMinutes === startTotalMinutes - 30) {
                                console.log(`🔔 スケジュール通知: ${schedule}`)

                                if(startMinute === 0){
                                    fetch('http://127.0.0.1:5000/kachaka-talk', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ message: `${startHour}時の${schedule}まで、あと30分だよ` })
                                    }).catch(err => console.error('カチャカの呼びかけエラー:', err))
                                }else{
                                    fetch('http://127.0.0.1:5000/kachaka-talk', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ message: `${startHour}時${startMinute}分の${schedule}まで、あと30分だよ` })
                                    }).catch(err => console.error('カチャカの呼びかけエラー:', err))
                                }
                                
                                setExecutedSchedules(prev => new Set([...prev, scheduleKey]))
                            }
                        }
                    }
                })
            }
        }

        const interval = setInterval(checkSchedules, 300000)
        checkSchedules()
        
        return () => clearInterval(interval)
    }, [schedules, executedSchedules])

    const generateCalendar = () => {
        const year = currentMonth.getFullYear()
        const month = currentMonth.getMonth()
        const firstDay = new Date(year, month, 1)
        const lastDay = new Date(year, month + 1, 0)
        const startDay = firstDay.getDay()
        const days = []

        for (let i = 0; i < startDay; i++) {
            days.push(null)
        }

        for (let i = 1; i <= lastDay.getDate(); i++) {
            days.push(new Date(year, month, i))
        }

        return days
    }

    const days = generateCalendar()
    const weekDays = ['日', '月', '火', '水', '木', '金', '土']

    const formatDate = (date) => {
        if (!date) return ''
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    const generateTimeSlots = () => {
        const slots = []
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                slots.push({ hour: h, minute: m })
            }
        }
        return slots
    }

    const timeSlots = generateTimeSlots()

    const handleDateClick = (date) => {
        const key = formatDate(date)
        if (selectedDates.some(sd => formatDate(sd) === key)) {
            setSelectedDates(selectedDates.filter(sd => formatDate(sd) !== key))
        } else {
            setSelectedDates([...selectedDates, date])
        }
    }

    const [selectedTimeSlotFirst, setSelectedTimeSlotFirst] = useState('')
    const [selectedTimeSlotLast, setSelectedTimeSlotLast] = useState('')

    const handleTimeSlotClick = (hour, minute) => {
        const timeKey = `${hour}-${minute}`
        if(selectedTimeSlotLast){
            if(timeKey === selectedTimeSlotLast){
                setSelectedTimeSlotLast('')
                setSelectedTimeSlots([selectedTimeSlotFirst])
            }else if(timeKey === selectedTimeSlotFirst){
                setSelectedTimeSlotFirst(selectedTimeSlotLast)
                setSelectedTimeSlotLast('')
                setSelectedTimeSlots([selectedTimeSlotLast])
            }
        }else if(selectedTimeSlotFirst){
            if(timeKey === selectedTimeSlotFirst){
                setSelectedTimeSlotFirst('')
                setSelectedTimeSlots([])
            }else{
                const slots = []
                const [h1, m1] = selectedTimeSlotFirst.split('-').map(Number)
                const [h2, m2] = timeKey.split('-').map(Number)
                const startTotal = h1 * 60 + m1
                const endTotal = h2 * 60 + m2
                const [from, to] = startTotal < endTotal ? [startTotal, endTotal] : [endTotal, startTotal]
                for(let t = from; t <= to; t += 30){
                    const h = Math.floor(t / 60)
                    const m = t % 60
                    slots.push(`${h}-${m}`)
                }
                setSelectedTimeSlotLast(timeKey)
                setSelectedTimeSlots(slots)
            }
        }else{
            setSelectedTimeSlotFirst(timeKey)
            setSelectedTimeSlots([timeKey])
        }
    }

    const handleSaveMemo = () => {
        if (selectedDates.length === 0 || selectedTimeSlots.length === 0) {
            alert('日付と時間を選択してください')
            return
        }

        const sortedSlots = selectedTimeSlots.map(slot => {
            const [h, m] = slot.split('-').map(Number)
            return { hour: h, minute: m, key: slot }
        }).sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))

        const firstSlot = sortedSlots[0]
        const lastSlot = sortedSlots[sortedSlots.length - 1]
        const startTime = `${String(firstSlot.hour).padStart(2, '0')}:${String(firstSlot.minute).padStart(2, '0')}`
        if(lastSlot.minute === 30){
            lastSlot.hour +=1
            lastSlot.minute = 0
        }else{
            lastSlot.minute = 30
        }
        const endTime = `${String(lastSlot.hour).padStart(2, '0')}:${String(lastSlot.minute).padStart(2, '0')}`

        const scheduleText = `[${startTime}, ${endTime}] ${memo}`

        const newSchedules = { ...schedules }
        selectedDates.forEach(date => {
            const key = formatDate(date)
            if (!newSchedules[key]) {
                newSchedules[key] = []
            }
            if (Array.isArray(newSchedules[key])) {
                newSchedules[key] = [...newSchedules[key], scheduleText]
            } else {
                newSchedules[key] = [newSchedules[key], scheduleText]
            }
            
            // スケジュールを開始時刻でソート
            newSchedules[key].sort((a, b) => {
                const matchA = a.match(/\[(\d{2}):(\d{2})/)
                const matchB = b.match(/\[(\d{2}):(\d{2})/)
                if (!matchA || !matchB) return 0
                
                const timeA = parseInt(matchA[1]) * 60 + parseInt(matchA[2])
                const timeB = parseInt(matchB[1]) * 60 + parseInt(matchB[2])
                return timeA - timeB
            })
        })

        setSchedules(newSchedules)
        setSelectedDates([])
        setSelectedTimeSlots([])
        setSelectedTimeSlotFirst('')
        setSelectedTimeSlotLast('')
        setMemo('')
    }

    const resetDates = () => {
        setSelectedDates([])
    }

    const handleWeekdayClick = (dayOfWeek) => {
        const datesOfWeekday = days.filter(date => date && date.getDay() === dayOfWeek)
        
        const allSelected = datesOfWeekday.every(date => 
            selectedDates.some(sd => formatDate(sd) === formatDate(date))
        )
        
        if (allSelected) {
            const keysToRemove = datesOfWeekday.map(formatDate)
            setSelectedDates(selectedDates.filter(sd => !keysToRemove.includes(formatDate(sd))))
        } else {
            const newDates = datesOfWeekday.filter(date => 
                !selectedDates.some(sd => formatDate(sd) === formatDate(date))
            )
            setSelectedDates([...selectedDates, ...newDates])
        }
    }

    const prevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
        setSelectedDates([])
    }

    const nextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
        setSelectedDates([])
    }

    return (
        <div className="schedule-container">
            <h2>スケジュール設定</h2>
            
            <div style={{ marginTop: 16 }}>
                <div className="schedule-header">
                    <button onClick={prevMonth} className="schedule-nav-btn">← 前月</button>
                    <h3>{currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月</h3>
                    <button onClick={nextMonth} className="schedule-nav-btn">次月 →</button>
                </div>

                <div className="schedule-reset">
                    <button onClick={resetDates} className="schedule-reset-btn">選択をクリア</button>
                </div>

                <div className="calendar-grid">
                    {weekDays.map((day, i) => (
                        <div 
                            key={i} 
                            className={`weekday-header ${i === 0 ? 'weekday-sunday' : i === 6 ? 'weekday-saturday' : ''}`}
                            onClick={() => handleWeekdayClick(i)}
                            style={{ cursor: 'pointer' }}
                        >
                            {day}
                        </div>
                    ))}
                    {days.map((date, i) => {
                        const key = formatDate(date)
                        const hasSchedule = date && schedules[key]
                        const isSelected = date && selectedDates.some(sd => formatDate(sd) === key)
                        const isToday = date && formatDate(date) === formatDate(new Date())
                        
                        const classNames = [
                            'calendar-day',
                            !date && 'calendar-day-empty',
                            isSelected && 'calendar-day-selected',
                            !isSelected && isToday && 'calendar-day-today',
                            !isSelected && !isToday && hasSchedule && 'calendar-day-has-schedule'
                        ].filter(Boolean).join(' ')
                        
                        return (
                            <div 
                                key={i}
                                onClick={() => date && handleDateClick(date)}
                                className={classNames}
                                style={{ position: 'relative' }}
                            >
                                {date && date.getDate()}
                                {hasSchedule && (
                                    <div style={{ display: 'flex', gap: '2px', position: 'absolute', bottom: '2px', right: '2px' }}>
                                        {(() => {
                                            const scheduleList = Array.isArray(schedules[key]) ? schedules[key] : [schedules[key]]
                                            console.log(`日付: ${key}, スケジュール数: ${scheduleList.length}`, scheduleList)
                                            return scheduleList.map((_, i) => (
                                                <div 
                                                    key={i} 
                                                    className={`schedule-indicator ${isSelected ? 'schedule-indicator-selected' : ''}`}
                                                />
                                            ))
                                        })()}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
                {selectedDates.length > 0 && (
                    <div className="schedule-memo-container">
                        <h4>選択した日付: {selectedDates.map(d => formatDate(d)).join(', ')}</h4>
                        <div>
                            {selectedDates.map((date,i) => {
                                const dateKey = formatDate(date)
                                return (
                                <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                                    <h5>{dateKey}のスケジュール:</h5>
                                    {(Array.isArray(schedules[dateKey]) 
                                        ? schedules[dateKey] 
                                        : [schedules[dateKey]]
                                    ).map((schedule, index) => (
                                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', padding: '8px', backgroundColor: 'white', borderRadius: '4px' }}>
                                            <p style={{ margin: 0, fontSize: '14px', flex: 1 }}>{schedule}</p>
                                            <button 
                                                onClick={() => {
                                                    const key = dateKey
                                                    const newSchedules = { ...schedules }
                                                    const scheduleArray = Array.isArray(newSchedules[key]) ? newSchedules[key] : [newSchedules[key]]
                                                    scheduleArray.splice(index, 1)
                                                    if (scheduleArray.length === 0) {
                                                        delete newSchedules[key]
                                                    } else {
                                                        newSchedules[key] = scheduleArray
                                                    }
                                                    setSchedules(newSchedules)
                                                    alert('スケジュールを削除しました')
                                                }}
                                                style={{ 
                                                    padding: '4px 8px', 
                                                    backgroundColor: '#f44336', 
                                                    color: 'white', 
                                                    border: 'none', 
                                                    borderRadius: '4px', 
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    marginLeft: '8px'
                                                }}
                                            >
                                                削除
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                )
                            })}
                            {/* {selectedDates.length === 1 && schedules[formatDate(selectedDates[0])] && (
                            )} */}
                        </div>
                        
                        {/* <select
                            value={timing}
                            onChange={(e) => setFrequencyMs(Number(e.target.value))}
                            style={{ padding: '6px', marginTop: 4 }}
                        >
                            <option value={0}>選択してください</option>
                            <option value={1 * 60 * 60 * 1000}>予定時刻</option>
                            <option value={2 * 60 * 60 * 1000}>5分前</option>
                            <option value={3 * 60 * 60 * 1000}>15分前</option>
                            <option value={5 * 60 * 60 * 1000}>30分前</option>
                        </select> */}
                        <div style={{ marginTop: '16px' }}>
                            <h5>時間を選択してください:</h5>
                            <div className="time-grid">
                                {timeSlots.map(({ hour, minute }) => {
                                    const timeKey = `${hour}-${minute}`
                                    const isSelected = selectedTimeSlots.includes(timeKey)
                                    return (
                                        <div
                                            key={timeKey}
                                            className={`time-block ${isSelected ? 'time-block-selected' : ''}`}
                                            onClick={() => handleTimeSlotClick(hour, minute)}
                                        >
                                            <p style={{ margin: 0 }}>{String(hour).padStart(2, '0')}</p>
                                            <p style={{ margin: 0 }}>{String(minute).padStart(2, '0')}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <div>
                            
                        </div>
                        <textarea
                            value={memo}
                            onChange={e => setMemo(e.target.value)}
                            placeholder="メモを入力"
                            className="schedule-memo-textarea"
                        />
                        <button onClick={handleSaveMemo} className="schedule-save-btn">保存</button>
                    </div>
                )}            </div>

            <p className="schedule-back-link"><Link to="/">← ホームに戻る</Link></p>
        </div>
    )
}

// function Preview(){
//     const navigate = useNavigate()
//     const [imgUrl, setImgUrl] = React.useState('')
//     React.useEffect(() => {
//         setImgUrl('http://127.0.0.1:5000/image/preview.png')
//     }, [])
//     return (
//         <div 
//             onClick={() => navigate('/')}
//             style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', background: '#222', cursor: 'pointer' }}
//         >
//             <img
//                 src={imgUrl}
//                 alt="preview"
//                 style={{ width: '100vw', height: '100vh', objectFit: 'cover', display: 'block' }}
//             />
//         </div>
//     )
// }

function Setting() {
    const [frequencyMs, setFrequencyMs] = useState(0)
    const [running, setRunning] = useState(false)
    const [status, setStatus] = useState('')
    const [nextAt, setNextAt] = useState(null)
    const [countdown, setCountdown] = useState('')
    const [previewUrl, setPreviewUrl] = useState('')
    
    useEffect(() => {
        const url = `http://127.0.0.1:5000/image/preview.png?${Date.now()}`
        fetch(url, { method: 'HEAD' })
            .then(res => {
                if (res.ok) setPreviewUrl(url)
                else setPreviewUrl('')
            })
            .catch(() => setPreviewUrl(''))
    }, [])
    
    const [uploadStatus, setUploadStatus] = useState('')
    const fileRef = useRef(null)

    const handleImageUpload = async () => {
        const file = fileRef.current?.files?.[0]
        if (!file) {
            setUploadStatus('画像を選択してください')
            return
        }
        const form = new FormData()
        form.append('image', file, 'preview.png')
        try {
            setUploadStatus('保存中…')
            const res = await fetch('http://127.0.0.1:5000/save-preview', {
                method: 'POST',
                body: form
            })
            const json = await res.json()
            if (json.ok) {
                setUploadStatus('保存完了 ✅')
                setPreviewUrl(`http://127.0.0.1:5000/image/preview.png?${Date.now()}`)
            } else {
                setUploadStatus(`保存失敗: ${json.error}`)
            }
        } catch (e) {
            setUploadStatus(`エラー: ${e.message}`)
        }
    }

    const sendOnce = async () => {
        try {
            setStatus('送信中…')
            const res = await fetch('http://127.0.0.1:5000/send-mail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject: '', body: '' })
            })
            const json = await res.json()
            if (json.ok) setStatus('送信完了 ✅')
            else setStatus(`失敗: ${json.error || 'Unknown error'}`)
        } catch (e) {
            setStatus(`通信エラー: ${e.message}`)
        }
    }

    const startAuto = () => {
        if (!frequencyMs || frequencyMs <= 0) {
            setStatus('頻度を選択してください')
            return
        }
        MailScheduler.start(frequencyMs)
        setRunning(true)
        setStatus(`自動送信を開始（間隔: ${Math.round(frequencyMs/1000)}秒）`)
    }

    const stopAuto = () => {
        MailScheduler.stop()
        setRunning(false)
        setStatus('自動送信を停止しました')
        setNextAt(null)
        setCountdown('')
    }

    useEffect(() => {
        const unsub = MailScheduler.subscribe(({ running, nextAt, frequencyMs }) => {
            setRunning(running)
            setNextAt(nextAt)
        })
        return unsub
    }, [])

    useEffect(() => {
        if (!running || !nextAt) {
            setCountdown('')
            return
        }
        const tick = () => {
            const remain = Math.max(0, nextAt - Date.now())
            const totalSec = Math.ceil(remain / 1000)
            const h = Math.floor(totalSec / 3600)
            const m = Math.floor((totalSec % 3600) / 60)
            const s = totalSec % 60
            const pad = (n) => String(n).padStart(2, '0')
            const text = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
            setCountdown(text)
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [running, nextAt])

    return (
        <div style={{ padding: 24 }}>
            <h2>設定</h2>

            <h3 style={{ marginTop: 16 }}>プレビュー画像の保存</h3>
            <input type="file" accept="image/*" ref={fileRef} style={{ marginTop: 8 }} />
            <button onClick={handleImageUpload} style={{ padding: '8px 12px', marginTop: 8 }}>保存</button>
            {uploadStatus && <p style={{ marginTop: 8 }}>{uploadStatus}</p>}
            <div style={{ marginTop: 12 }}>
                <p>プレビュー:</p>
                {previewUrl ? (
                    <img src={previewUrl} alt="preview" style={{ maxWidth: 300, border: '1px solid #ccc' }} />
                ) : (
                    <span style={{ color: '#888' }}>画像がありません</span>
                )}
            </div>

            <h3 style={{ marginTop: 24 }}>送信頻度の設定</h3>
            <label style={{ display: 'block', marginTop: 8 }}>頻度を選択:</label>
            <select
                value={frequencyMs}
                onChange={(e) => setFrequencyMs(Number(e.target.value))}
                style={{ padding: '6px', marginTop: 4 }}
            >
                <option value={0}>選択してください</option>
                <option value={1 * 60 * 60 * 1000}>1時間ごと</option>
                <option value={2 * 60 * 60 * 1000}>2時間ごと</option>
                <option value={3 * 60 * 60 * 1000}>3時間ごと</option>
                <option value={5 * 60 * 60 * 1000}>5時間ごと</option>
            </select>

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button onClick={startAuto} disabled={running} style={{ padding: '8px 12px' }}>開始</button>
                <button onClick={stopAuto} disabled={!running} style={{ padding: '8px 12px' }}>停止</button>
                <button onClick={sendOnce} style={{ padding: '8px 12px' }}>今すぐ1回送信</button>
            </div>

            {status && <p style={{ marginTop: 12 }}>{status}</p>}
            {running && countdown && (
                <p style={{ marginTop: 8 }}>次の送信まで: {countdown}</p>
            )}

            <p style={{ marginTop: 16 }}><Link to="/">← ホームに戻る</Link></p>
        </div>
    )
}

function Talk() {
    const [answer, setAnswer] = useState('')
    const [isRecording, setIsRecording] = useState(false)
    const [recordingText, setRecordingText] = useState('')
    const [isLoadingModel, setIsLoadingModel] = useState(false)
    const [modelReady, setModelReady] = useState(false)

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch('http://127.0.0.1:5000/recording-status')
                const json = await res.json()
                setIsLoadingModel(json.is_loading_model || false)
                setModelReady(json.model_ready || false)
                
                if (!json.model_ready && !json.is_loading_model) {
                    fetch('http://127.0.0.1:5000/start-recording', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    }).catch(() => {})
                }
            } catch (error) {
            }
        }
        
        checkStatus()
        const interval = setInterval(checkStatus, 1000)
        return () => clearInterval(interval)
    }, [])

    const handleListen = async () => {
        if (!isRecording) {
            try {
                const res = await fetch('http://127.0.0.1:5000/start-recording', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
                const json = await res.json()
                if (json.ok) {
                    setIsRecording(true)
                    setRecordingText('')
                    setAnswer('🎤 録音中...')
                } else {
                    setAnswer(`エラー: ${json.error}`)
                }
            } catch (error) {
                setAnswer('エラーが発生しました: ' + error.message)
            }
        } else {
            try {
                setAnswer('⏹ 少し待ってね...')
                const res = await fetch('http://127.0.0.1:5000/stop-recording', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
                const json = await res.json()
                setIsRecording(false)
                if (json.ok) {
                    setRecordingText(json.text)
                    setAnswer(`話しかけた内容:\n${json.text}\n\n返答を考えています...`)
                    
                    const answerText = await mekeAnswer(json.text)
                    setAnswer(`話しかけた内容:\n${json.text}\n\n返答:\n${answerText}`)

                    try {
                        await fetch('http://127.0.0.1:5000/kachaka-talk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: answerText })
                        })
                    } catch (err) {
                        console.error('カチャカの発話エラー:', err)
                    }
                    
                } else {
                    setAnswer(`エラー: ${json.error}`)
                }
            } catch (error) {
                setIsRecording(false)
                setAnswer('エラーが発生しました: ' + error.message)
            }
        }
    }

    const buttonDisabled = isLoadingModel || (!modelReady && !isRecording)

    return (
        <div style={{ padding: 24 }}>
            <h2>おはなし</h2>
            {!modelReady && (
                <div style={{ 
                    marginTop: '16px', 
                    padding: '12px', 
                    backgroundColor: '#fff3cd', 
                    border: '1px solid #ffc107',
                    borderRadius: '4px',
                    color: '#856404'
                }}>
                    ちょっと待ってね. . . 
                </div>
            )}
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button 
                    onClick={handleListen}
                    disabled={buttonDisabled}
                    style={{ 
                        padding: '10px 20px', 
                        fontSize: '16px',
                        backgroundColor: isRecording ? '#ff4444' : (buttonDisabled ? '#ccc' : '#4CAF50'),
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: buttonDisabled ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isRecording ? '⏹ 録音停止' : '🎤 話を聞く'}
                </button>
            </div>
            {answer && (
                <div style={{ 
                    marginTop: '20px', 
                    padding: '16px', 
                    border: '1px solid #ccc', 
                    borderRadius: '4px',
                    backgroundColor: '#f9f9f9',
                    whiteSpace: 'pre-wrap'
                }}>
                    <h3>回答:</h3>
                    <p>{answer}</p>
                </div>
            )}
            <p style={{ marginTop: 16 }}><Link to="/">← ホームに戻る</Link></p>
        </div>
    )
}

function Cradle() {
    const [frequencyMs, setFrequencyMs] = useState(0)

    const handleMoveCradle = async () => {
        try {
            const res = await fetch('http://127.0.0.1:5000/kachaka-move-cradle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frequency_ms: frequencyMs })
            })
            const json = await res.json()
        } catch (error) {
        }
    }

    return (
        <div style={{ padding: 24 }}>
            <h2>ゆりかごモード</h2>
            <select
                value={frequencyMs}
                onChange={(e) => setFrequencyMs(Number(e.target.value))}
                style={{ padding: '6px', marginTop: 4 }}
            >
                <option value={0}>選択してください</option>
                <option value={10 * 60 * 1000}>10分</option>
                <option value={20 * 60 * 1000}>20分</option>
                <option value={30 * 60 * 1000}>30分</option>
                <option value={60 * 60 * 1000}>1時間</option>
            </select>
            <button 
                onClick={handleMoveCradle} 
                style={{padding: '10px 20px', fontSize: '16px'}} 
            >動かし始める</button>
            <p style={{ marginTop: 16 }}><Link to="/">← ホームに戻る</Link></p>
        </div>
    )
}

root.render(
    <BrowserRouter>
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/setting" element={<Setting />} />
            {/* <Route path="/preview" element={<Preview />} /> */}
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/talk" element={<Talk />} />
            <Route path="/cradle" element={<Cradle />} />
        </Routes>
    </BrowserRouter>
)