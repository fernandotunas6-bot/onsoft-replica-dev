import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import '../network/api_endpoints.dart';

class MediaRepository {
  final Dio _dio;

  MediaRepository(this._dio);

  /// Uploads a profile image; returns the R2 object key (store on student/user row).
  Future<String> uploadProfilePhoto(String filePath) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath,
          filename: filePath.split(RegExp(r'[/\\]')).last),
    });
    final response = await _dio.post(
      ApiEndpoints.mediaProfilePhoto,
      data: form,
    );
    final key = (response.data as Map<String, dynamic>)['key'] as String?;
    if (key == null || key.isEmpty) {
      throw StateError('Upload response missing key');
    }
    return key;
  }

  /// Same as [uploadProfilePhoto] but works on web and mobile (bytes upload).
  Future<String> uploadProfilePhotoXFile(XFile file) async {
    final bytes = await file.readAsBytes();
    final name = file.name.trim().isEmpty ? 'profile.jpg' : file.name;
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: name),
    });
    final response = await _dio.post(
      ApiEndpoints.mediaProfilePhoto,
      data: form,
    );
    final key = (response.data as Map<String, dynamic>)['key'] as String?;
    if (key == null || key.isEmpty) {
      throw StateError('Upload response missing key');
    }
    return key;
  }
}
