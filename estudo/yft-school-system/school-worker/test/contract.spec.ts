import { env, applyD1Migrations } from "cloudflare:test";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppEnv, User } from "../src/app-env";
import attendance from "../src/api/attendance";
import classes from "../src/api/classes";
import conversations from "../src/api/conversations";
import grades from "../src/api/grades";
import notices from "../src/api/notices";
import subjects from "../src/api/subjects";
import timetable from "../src/api/timetable";
import users from "../src/api/users";

/**
 * Respostas reais das rotas, para os testes de contrato do app
 * (`test/contract/fixtures/*.json`). Correr com CONTRACT_DUMP=1 imprime-as;
 * `scripts/update-contract-fixtures.sh` grava-as.
 */
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
	c.set("user", JSON.parse(c.req.header("X-Test-User")!) as User);
	await next();
});
for (const [p, r] of Object.entries({ attendance, classes, conversations, grades, notices, subjects, timetable, users })) app.route(`/${p}`, r);

const admin: User = { uid: "q-adm", schoolId: "q1", role: "admin" };
const teacher: User = { uid: "q-tch", schoolId: "q1", role: "teacher" };
const parent: User = { uid: "q-par", schoolId: "q1", role: "parent" };

const call = async (u: User, path: string, init: RequestInit = {}) => {
	const res = await app.request(path, { ...init, headers: { "Content-Type": "application/json", "X-Test-User": JSON.stringify(u) } }, env);
	expect(res.status).toBeLessThan(300);
	return res.json();
};
const body = (b: unknown, method = "POST") => ({ method, body: JSON.stringify(b) });

const fixtures: Record<string, unknown> = {};

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	await env.DB.batch(
		[
			`INSERT INTO Schools (id, name, academic_calendar_json) VALUES ('q1', 'Colégio Luz do Mundo', '{"academic_year":"2025/2026","active_term":"Term 1","currency":"Kz","term_system":3,"terms":[]}')`,
			"INSERT INTO Users (uid, school_id, role, name, phone, email, subjects_text) VALUES ('q-adm', 'q1', 'admin', 'Direcção', NULL, 'dir@luz.ao', NULL), ('q-tch', 'q1', 'teacher', 'Carlos Mendes', '923000002', 'carlos@luz.ao', 'Matemática'), ('q-par', 'q1', 'parent', 'Mariana Silva', '923000003', 'mariana@luz.ao', NULL)",
			"INSERT INTO Classes (id, school_id, class_name, level) VALUES ('q-c10', 'q1', '10ª Classe', 10)",
			"INSERT INTO Subjects (id, school_id, name) VALUES ('q-mat', 'q1', 'Matemática')",
			"INSERT INTO SubjectClasses (id, school_id, subject_id, class_id) VALUES ('q-sc', 'q1', 'q-mat', 'q-c10')",
			"INSERT INTO Students (id, school_id, class_id, parent_uid, name) VALUES ('q-st', 'q1', 'q-c10', 'q-par', 'Ana Silva')",
			"INSERT INTO Enrollments (id, school_id, student_id, subject_id, term_id, class_score, exam_score, academic_year) VALUES ('q-e', 'q1', 'q-st', 'q-mat', 'Term 1', 24.5, 58, '2025/2026')",
		].map((sql) => env.DB.prepare(sql)),
	);
});

describe("contrato", () => {
	it("gera as respostas das rotas usadas pelo app", async () => {
		await call(admin, "/timetable", body({ class_id: "q-c10", subject_id: "q-mat", weekday: 1, start_time: "09:00", end_time: "10:30", room: "Sala 3", teacher_uid: "q-tch" }));
		await call(admin, "/timetable", body({ class_id: "q-c10", title: "Almoço", weekday: 1, start_time: "12:15", end_time: "13:30" }));
		fixtures.timetable = await call(parent, "/timetable");
		fixtures.timetable_mine = await call(teacher, "/timetable?mine=1");

		await call(teacher, "/attendance", body({ class_id: "q-c10", date: "2026-03-02", records: [{ student_id: "q-st", present: false }] }, "PUT"));
		fixtures.attendance_roster = await call(teacher, "/attendance?class_id=q-c10&date=2026-03-02");
		fixtures.attendance_roster_unmarked = await call(teacher, "/attendance?class_id=q-c10&date=2026-03-03");
		fixtures.attendance_summary = await call(teacher, "/attendance/summary?class_id=q-c10");
		fixtures.attendance_student = await call(parent, "/attendance/student/q-st");

		fixtures.grades = await call(parent, "/grades?student_id=q-st&term=Term%201");
		fixtures.grade_years = await call(parent, "/grades/years?student_id=q-st");
		fixtures.subjects_parent = await call(parent, "/subjects");
		fixtures.classes_parent = await call(parent, "/classes");
		fixtures.teachers = await call(admin, "/users/teachers");

		await call(admin, "/notices", body({ title: "Reunião de pais", body: "Sexta às 14h.", audience: "class", class_id: "q-c10", category: "event" }));
		fixtures.notices_parent = await call(parent, "/notices");
		fixtures.notices_unread = await call(parent, "/notices/unread-count");

		const { id } = (await call(parent, "/conversations", body({ user_uid: "q-tch" }))) as { id: string };
		await call(parent, `/conversations/${id}/messages`, body({ body: "Bom dia, professor." }));
		fixtures.conversations = await call(teacher, "/conversations");
		fixtures.conversations_unread = await call(teacher, "/conversations/unread-count");
		fixtures.conversation_contacts = await call(teacher, "/conversations/contacts");
		fixtures.conversation_messages = await call(teacher, `/conversations/${id}/messages`);

		fixtures.users_me_patch = await call(parent, "/users/me", body({ name: "Mariana Silva", residential_address: "Luanda" }, "PATCH"));

		expect(Object.keys(fixtures).length).toBeGreaterThan(15);
		// eslint-disable-next-line no-console
		if (env.CONTRACT_DUMP) console.log(`CONTRACT_FIXTURES=${JSON.stringify(fixtures)}`);
	});
});
