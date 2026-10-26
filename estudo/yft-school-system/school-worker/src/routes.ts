import { Hono } from 'hono';
import type { AppEnv } from './app-env';
import { authMiddleware } from './middleware/auth';
import classes from './api/classes';
import finance from './api/finance';
import parents from './api/parents';
import students from './api/students';
import subjects from './api/subjects';
import users from './api/users';
import wards from './api/wards';
import superAdmin from './api/super-admin';
import media from './api/media';
import grades from './api/grades';
import settings from './api/settings';
import notices from './api/notices';
import timetable from './api/timetable';
import attendance from './api/attendance';
import conversations from './api/conversations';

export const apiRoutes = new Hono<AppEnv>();

apiRoutes.use('*', authMiddleware);
apiRoutes.route('/media', media);
apiRoutes.route('/grades', grades);
apiRoutes.route('/settings', settings);
apiRoutes.route('/classes', classes);
apiRoutes.route('/subjects', subjects);
apiRoutes.route('/students', students);
apiRoutes.route('/parents', parents);
apiRoutes.route('/finance', finance);
apiRoutes.route('/notices', notices);
apiRoutes.route('/timetable', timetable);
apiRoutes.route('/attendance', attendance);
apiRoutes.route('/conversations', conversations);
apiRoutes.route('/users', users);
apiRoutes.route('/wards', wards);

export const superAdminRoutes = superAdmin;
