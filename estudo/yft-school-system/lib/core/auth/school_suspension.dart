import 'package:flutter_riverpod/flutter_riverpod.dart';

class SchoolSuspended extends Notifier<bool> {
  @override
  bool build() => false;

  void setSuspended(bool value) => state = value;
}

/// Set true when API returns 403 with `code: school_suspended`.
final schoolSuspendedProvider =
    NotifierProvider<SchoolSuspended, bool>(SchoolSuspended.new);

/// Wired from [AppRoot] so [api_client] can trigger without a [WidgetRef].
void Function()? notifySchoolSuspended;

void markSchoolSuspended() {
  notifySchoolSuspended?.call();
}
