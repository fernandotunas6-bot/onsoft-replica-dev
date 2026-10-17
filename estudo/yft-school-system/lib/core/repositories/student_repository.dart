import 'package:dio/dio.dart';
import '../models/paginated_response.dart';
import '../models/parent_user.dart';
import '../models/student.dart';
import '../network/api_endpoints.dart';

class StudentRepository {
  final Dio _dio;

  StudentRepository(this._dio);

  Future<PaginatedResponse<Student>> getStudents({
    String? classId,
    int page = 1,
    int limit = 25,
  }) async {
    final response = await _dio.get(
      ApiEndpoints.students,
      queryParameters: {
        'page': page,
        'limit': limit,
        'class_id': ?classId,
      },
    );
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      Student.fromJson,
    );
  }

  /// Either [parentUid] (existing parent) or [parentName] + [parentPhone] (new parent).
  Future<Map<String, dynamic>> createStudent({
    required String name,
    required String classId,
    String? dob,
    String? gender,
    double? balance,
    String? parentUid,
    String? parentName,
    String? parentPhone,
    String? parentEmail,
    String? photoUrl,
    String? previousSchool,
    String? address,
    String? emergencyContactName,
    String? emergencyContactPhone,
    String? bloodGroup,
    String? medicalNotes,
  }) async {
    final data = <String, dynamic>{
      'name': name,
      'class_id': classId,
      'dob': ?dob,
      'gender': ?gender,
      'balance': ?balance,
      'photo_url': ?photoUrl,
      'previous_school': ?previousSchool,
      'address': ?address,
      'emergency_contact_name': ?emergencyContactName,
      'emergency_contact_phone': ?emergencyContactPhone,
      'blood_group': ?bloodGroup,
      'medical_notes': ?medicalNotes,
    };
    if (parentUid != null && parentUid.isNotEmpty) {
      data['parent_uid'] = parentUid;
    } else {
      data['parent'] = {
        'name': parentName ?? '',
        'phone': parentPhone ?? '',
        'email': ?parentEmail,
      };
    }

    final response = await _dio.post(ApiEndpoints.students, data: data);
    return response.data as Map<String, dynamic>;
  }

  /// Search existing parents (admin/teacher). GET `/api/parents?q=…`.
  Future<List<ParentUser>> searchParents({String query = ''}) async {
    final response = await _dio.get(
      ApiEndpoints.parents,
      queryParameters: {
        if (query.isNotEmpty) 'q': query,
      },
    );
    final list = response.data['data'] as List;
    return list
        .map((e) => ParentUser.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Single student (admin/teacher). Worker returns the row object directly.
  Future<Student> getStudentById(String id) async {
    final response = await _dio.get(ApiEndpoints.studentById(id));
    return Student.fromJson(response.data as Map<String, dynamic>);
  }

  /// Admin only. PATCH `/api/students/:id`.
  Future<Student> updateStudent(
    String id, {
    String? name,
    String? classId,
    String? dob,
    String? gender,
    bool? isActive,
    String? photoUrl,
    String? previousSchool,
    String? address,
    String? emergencyContactName,
    String? emergencyContactPhone,
    String? bloodGroup,
    String? medicalNotes,
    String? parentName,
    String? parentPhone,
    String? parentEmail,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (classId != null) body['class_id'] = classId;
    if (dob != null) body['dob'] = dob;
    if (gender != null) body['gender'] = gender;
    if (isActive != null) body['is_active'] = isActive;
    if (photoUrl != null) body['photo_url'] = photoUrl;
    if (previousSchool != null) body['previous_school'] = previousSchool;
    if (address != null) body['address'] = address;
    if (emergencyContactName != null) {
      body['emergency_contact_name'] = emergencyContactName;
    }
    if (emergencyContactPhone != null) {
      body['emergency_contact_phone'] = emergencyContactPhone;
    }
    if (bloodGroup != null) body['blood_group'] = bloodGroup;
    if (medicalNotes != null) body['medical_notes'] = medicalNotes;

    if (parentName != null || parentPhone != null || parentEmail != null) {
      body['parent'] = {
        'name': ?parentName,
        'phone': ?parentPhone,
        'email': ?parentEmail,
      };
    }

    final response = await _dio.patch(ApiEndpoints.studentById(id), data: body);
    return Student.fromJson(response.data as Map<String, dynamic>);
  }

  /// Admin only. DELETE `/api/students/:id`.
  Future<void> deleteStudent(String id) async {
    await _dio.delete(ApiEndpoints.studentById(id));
  }

  /// Parent's children. Worker returns `{ data: [...] }`.
  Future<List<Student>> getWards() async {
    final response = await _dio.get(ApiEndpoints.wards);
    final list = response.data['data'] as List;
    return list
        .map((e) => Student.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
