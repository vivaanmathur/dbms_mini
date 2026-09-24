import { motion } from "framer-motion";
import {
  Sparkles, Brain, TriangleAlert, Wand2, Users2, Shuffle, Lock,
} from "lucide-react";
import Shell from "../components/Shell.jsx";
import { Card, LinkCard } from "../ui.jsx";

/*
 * Provision for the planned admin / AI features.
 *
 * IMPORTANT: except for the recommender, none of this is implemented. These
 * are deliberately placeholders so the shape of the idea can be seen and
 * argued about before any of it is built. Nothing on this page invents
 * numbers or pretends a model exists - see docs/ROADMAP.md.
 */
const FEATURES = [
  {
    Icon: Brain,
    title: "Explainable substitute recommender",
    status: "partly working",
    body: "Ranks who could take a cancelled class on subject expertise, whether they have taught that very section, how free they are and how much they have already taught — and says why in plain words.",
    note: "Live now: open any of your lectures and choose \"Cannot take it\". Acceptance rate and response time are not tracked yet.",
  },
  {
    Icon: TriangleAlert,
    title: "Missed-learning risk dashboard",
    status: "planned",
    body: "Per class and subject: planned hours against delivered hours, topics covered against weeks remaining, and a flag on any subject drifting behind schedule.",
    note: "The data it needs already exists — lecture_log, vw_syllabus_progress and fn_delivered_hours. Only the screen is missing.",
  },
  {
    Icon: Wand2,
    title: "Recovery-plan optimiser",
    status: "planned",
    body: "When nobody can cover a class, propose the alternatives: a different hour, a different room, a make-up lab — scored on clashes, hours recovered and disruption to students.",
    note: "This is a constraint-solving problem, not machine learning. A solver such as OR-Tools is the honest tool for it.",
  },
  {
    Icon: Shuffle,
    title: "Dynamic resource allocation",
    status: "planned",
    body: "Admin-side reshuffling of rooms and staff across the whole week, instead of one lecture at a time.",
    note: "Needs the workload and preference rules to be settled first.",
  },
  {
    Icon: Users2,
    title: "Student and coordinator views",
    status: "planned",
    body: "A read-only timetable showing students who is actually taking their class on a given date, and a coordinator screen for classes still uncovered.",
    note: "Would need a student role — app_user.user_role currently has only ADMIN, HOD and FACULTY.",
  },
];

function Intelligence() {
  return (
    <Shell
      title="Intelligence"
      subtitle="Where this project is going next. Everything marked planned is a placeholder — no numbers on this page are real."
      actions={<span className="tag tag-ochre"><Lock size={11} /> provision only</span>}
    >
      <div className="stack" style={{ gap: 16 }}>
        <Card className="pad">
          <div className="row" style={{ gap: 11, alignItems: "flex-start" }}>
            <span style={{
              width: 34, height: 34, flex: "none", borderRadius: 3, display: "grid",
              placeItems: "center", background: "var(--ink)",
            }}>
              <Sparkles size={16} color="var(--card)" />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.3px" }}>
                From scheduling to learning continuity
              </h2>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.3, maxWidth: 760 }}>
                Today the app handles one lecture at a time: it is cancelled, somebody
                else takes it, it gets logged. The next step is to answer the question
                that actually matters — <b>is this class still going to finish its
                syllabus on time?</b> — and to fix it when the answer is no.
              </p>
              <p className="faint tiny" style={{ margin: "10px 0 0", maxWidth: 760 }}>
                To be clear about what is and is not here: the recommender is a ranking
                rule written in SQL, not a trained model. Nothing below has been
                evaluated against real history, so no accuracy is claimed.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid-auto">
          {FEATURES.map((feature, index) => {
            const live = feature.status === "partly working";
            return (
              <LinkCard key={feature.title} className="pad" delay={index * 0.05}>
                <div className="between" style={{ alignItems: "flex-start", marginBottom: 10 }}>
                  <span className="card-sunk" style={{
                    width: 32, height: 32, display: "grid", placeItems: "center",
                  }}>
                    <feature.Icon size={15} className="muted" />
                  </span>
                  <span className={"tag " + (live ? "tag-pine" : "tag-ochre")}>
                    {feature.status}
                  </span>
                </div>

                <div className="bold" style={{ fontSize: 14.5, letterSpacing: "-0.2px" }}>
                  {feature.title}
                </div>
                <p className="muted" style={{ margin: "7px 0 0", fontSize: 12.8 }}>{feature.body}</p>

                <div className="divide" style={{ margin: "12px 0 10px" }} />
                <p className="faint tiny" style={{ margin: 0 }}>{feature.note}</p>
              </LinkCard>
            );
          })}
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
          <Card className="pad">
            <div className="bold" style={{ fontSize: 14 }}>Open questions</div>
            <p className="muted tiny" style={{ margin: "7px 0 0" }}>
              Two decisions are still unsettled, and they pull in opposite directions.
              Right now a lecture can be handed to <b>anyone who is free</b>, because
              that is what was asked for. The external review argues subject
              qualification should instead be a <b>hard filter</b>. Both cannot be true.
              The second question is how much of this should be called AI at all.
              Full write-up in <code>docs/ROADMAP.md</code>.
            </p>
          </Card>
        </motion.div>
      </div>
    </Shell>
  );
}

export default Intelligence;
