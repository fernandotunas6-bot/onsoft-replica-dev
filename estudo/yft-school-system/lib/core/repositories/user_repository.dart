import 'package:dio/dio.dart';
import '../models/school_academic_calendar.dart';
import '../models/teacher_profile.dart';
import '../models/user_profile.dart';
import '../network/api_endpoints.dart';

class UserRepository {
  final Dio _dio;

  UserRepository(this._dio);

  Future<UserProfile> getProfile() async {
    final response = await _dio.get(ApiEndpoints.usersMe);
    final data = response.data['data'] as Map<String, dynamic>;
    return UserProfile.fromJson(data);
  }

  Future<void> storeFcmToken(String token, {String? platform}) async {
    await _dio.put(
      ApiEndpoints.usersMeFcmToken,
      data: {
        'token': token,
        'platform': ?platform,
      },
    );
  }

  Future<SchoolAcademicCalendar?> getAcademicCalendar() async {
    final response = await _dio.get(ApiEndpoints.usersMeAcademicCalendar);
    final raw = response.data['data'];
    if (raw == null) return null;
    return SchoolAcademicCalendar.fromJson(raw as Map<String, dynamic>);
  }

  Future<SchoolAcademicCalendar> saveAcademicCalendar({
    required SchoolAcademicCalendar calendar,
  }) async {
    final response = await _dio.patch(
      ApiEndpoints.usersMeAcademicCalendar,
      data: calendar.toJson(),
    );
    final raw = response.data['data'] as Map<String, dynamic>;
    return SchoolAcademicCalendar.fromJson(raw);
  }

  Future<TeacherProfile> getTeacherProfile(String uid) async {
    final response = await _dio.get(ApiEndpoints.usersTeacher(uid));
    final raw = response.data['data'] as Map<String, dynamic>;
    return TeacherProfile.fromJson(raw);
  }

  Future<Map<String, dynamic>> registerTeacher({
    required String name,
    required String phone,
    String? email,
    String? gender,
    String? photoUrl,
    String? residentialAddress,
    String? qualification,
    int? yearsExperience,
    String? subjectsText,
    String? ssnitNumber,
    String? maritalStatus,
    String? emergencyContactName,
    String? emergencyContactPhone,
    String? bankName,
    String? bankAccountNumber,
    String? bankAccountHolder,
    String? dateOfBirth,
  }) async {
    final response = await _dio.post(
      ApiEndpoints.usersRegisterTeacher,
      data: {
        'name': name,
        'phone': phone,
        if (email != null && email.isNotEmpty) 'email': email,
        if (gender != null && gender.isNotEmpty) 'gender': gender,
        if (photoUrl != null && photoUrl.isNotEmpty) 'photo_url': photoUrl,
        if (residentialAddress != null && residentialAddress.isNotEmpty)
          'residential_address': residentialAddress,
        if (qualification != null && qualification.isNotEmpty)
          'qualification': qualification,
        'years_experience': ?yearsExperience,
        if (subjectsText != null && subjectsText.isNotEmpty)
          'subjects_text': subjectsText,
        if (ssnitNumber != null && ssnitNumber.isNotEmpty)
          'ssnit_number': ssnitNumber,
        if (maritalStatus != null && maritalStatus.isNotEmpty)
          'marital_status': maritalStatus,
        if (emergencyContactName != null && emergencyContactName.isNotEmpty)
          'emergency_contact_name': emergencyContactName,
        if (emergencyContactPhone != null && emergencyContactPhone.isNotEmpty)
          'emergency_contact_phone': emergencyContactPhone,
        if (bankName != null && bankName.isNotEmpty) 'bank_name': bankName,
        if (bankAccountNumber != null && bankAccountNumber.isNotEmpty)
          'bank_account_number': bankAccountNumber,
        if (bankAccountHolder != null && bankAccountHolder.isNotEmpty)
          'bank_account_holder': bankAccountHolder,
        if (dateOfBirth != null && dateOfBirth.isNotEmpty)
          'date_of_birth': dateOfBirth,
      },
    );
    return response.data as Map<String, dynamic>;
  }
}
