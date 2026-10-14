import 'package:flutter/material.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class NotificationSettingsScreen extends StatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  State<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends State<NotificationSettingsScreen> {
  bool _pushEnabled = true;
  bool _emailEnabled = true;
  bool _smsEnabled = false;
  bool _feeAlerts = true;
  bool _academicAlerts = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Notifications',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Manage your notification preferences.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 32),

            const Text(
              'Delivery Methods',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
            ),
            const SizedBox(height: 16),

            _buildToggleItem(
              'Push Notifications',
              'Receive alerts directly on your device.',
              _pushEnabled,
              (val) => setState(() => _pushEnabled = val),
            ),
            _buildToggleItem(
              'Email Notifications',
              'Receive summarized alerts in your inbox.',
              _emailEnabled,
              (val) => setState(() => _emailEnabled = val),
            ),
            _buildToggleItem(
              'SMS Notifications',
              'Get instant text messages for critical info.',
              _smsEnabled,
              (val) => setState(() => _smsEnabled = val),
            ),

            const SizedBox(height: 32),
            const Divider(color: AppColors.surface, thickness: 2),
            const SizedBox(height: 32),

            const Text(
              'Notification Types',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
            ),
            const SizedBox(height: 16),

            _buildToggleItem(
              'Fee & Payment Alerts',
              'Updates on pending fees and transactions.',
              _feeAlerts,
              (val) => setState(() => _feeAlerts = val),
            ),
            _buildToggleItem(
              'Academic Updates',
              'Notices regarding grades, attendance, and terms.',
              _academicAlerts,
              (val) => setState(() => _academicAlerts = val),
            ),

            const SizedBox(height: 48),

            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Preferences saved!',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  );
                  Navigator.pop(context);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: AppColors.secondary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: const Text(
                  'Save Preferences',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildToggleItem(
    String title,
    String subtitle,
    bool value,
    Function(bool) onChanged,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: SwitchListTile(
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
        activeThumbColor: AppColors.primary,
        value: value,
        onChanged: onChanged,
      ),
    );
  }
}
