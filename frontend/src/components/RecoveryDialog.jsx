import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, Check } from "lucide-react";
import { api } from "../api.js";
import { Modal, shortDate, SkeletonRows, useToast } from "../ui.jsx";

/*
 * Finding a make-up slot. The server checks every slot in the next fortnight
 * against three hard rules (students free, teacher free, a suitable room
 * free) and scores what passes. If only Saturday works, it says so, and why.
 */
export default function RecoveryDialog({ item, onClose, onDone }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/insight/recovery/${item.cancellation_id}`).then(setData)
      .catch((e) => { toast(e.message, "err"); onClose(); });
  }, [item.cancellation_id]);

  async function book() {
    setBusy(true);
    try {
      const r = await api.post(`/insight/recovery/${item.cancellation_id}`, {
        date: chosen.date, start_time: chosen.start_time, end_time: chosen.end_time, room_id: chosen.room_id });
      toast(r.message);
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "err");
      setBusy(false);
    }
  }

  return (
    <Modal open wide onClose={onClose} title="Arrange a make-up class"
           subtitle={`${item.subject_code}${item.lab_batch_code ? " · " + item.lab_batch_code : ""} · ${item.class_label} · missed ${shortDate(item.lecture_date)}`}
           footer={<>
             <button className="btn" onClick={onClose}>Close</button>
             <button className="btn btn-primary" onClick={book} disabled={!chosen || busy}>
               <CalendarPlus size={14} />
               {chosen ? `Book ${shortDate(chosen.date)} ${chosen.start_time}` : "Pick a slot"}
             </button>
           </>}>
      {!data ? <SkeletonRows rows={4} /> : (
        <>
          <p className="muted tiny" style={{ margin: 0 }}>
            Every slot until {shortDate(data.searched_until)} was checked: the students free, the teacher
            free, a {data.lecture.room_type === "LAB" ? "lab" : "classroom"} free. <b>{data.found}</b> passed.
          </p>
          {data.options.length === 0 ? (
            <div className="notice notice-warn">Nothing fits in that window. The class has no free period
              long enough, or no suitable room is free when it does.</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {data.options.map((o, i) => {
                const on = chosen && chosen.date === o.date && chosen.start_time === o.start_time;
                return (
                  <motion.button key={o.date + o.start_time} type="button" className={"cand" + (on ? " cand-on" : "")}
                                 onClick={() => setChosen(o)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                 transition={{ delay: i * 0.04 }}>
                    <span className="avatar" style={{ width: 44 }}><span className="display" style={{ fontSize: 15 }}>{o.score}</span></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="bold" style={{ fontSize: 13.2 }}>{o.day_of_week} {shortDate(o.date)}
                        <span className="mono faint" style={{ marginLeft: 7 }}>{o.start_time}–{o.end_time}</span>
                        <span className="faint"> · {o.room_code}</span></span>
                      <span className="tiny faint" style={{ display: "block", marginTop: 2 }}>{o.notes.join(" · ")}</span>
                    </span>
                    {on && <Check size={15} />}
                  </motion.button>
                );
              })}
            </div>
          )}
          <p className="faint tiny" style={{ margin: 0 }}>
            The score starts at 100 and moves for each reason listed: sooner and the usual room are
            better; late evenings and Saturdays are worse.
          </p>
        </>
      )}
    </Modal>
  );
}
