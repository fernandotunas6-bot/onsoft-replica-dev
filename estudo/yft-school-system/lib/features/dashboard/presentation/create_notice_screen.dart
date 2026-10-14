import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

class CreateNoticeScreen extends StatefulWidget {
  const CreateNoticeScreen({super.key});

  @override
  State<CreateNoticeScreen> createState() => _CreateNoticeScreenState();
}

class _CreateNoticeScreenState extends State<CreateNoticeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _messageController = TextEditingController();
  String _targetAudience = 'Both (Teachers & Parents)';
  bool _sendSms = false;
  bool _sendPush = true;

  final List<String> _audiences = [
    'Both (Teachers & Parents)',
    'Teachers Only',
    'Parents Only',
    'Specific Class',
  ];

  @override
  void dispose() {
    _titleController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Create Notice',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: SingleChildScrollView(
        padding: getResponsiveHorizontalPadding(context).copyWith(
          top: 16,
          bottom: MediaQuery.of(context).padding.bottom + 120,
        ),
        child: ResponsiveConstrainedContent(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'New Announcement',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _titleController,
                  decoration: const InputDecoration(
                    hintText: 'Notice Title',
                    prefixIcon: Icon(LucideIcons.type, size: 20),
                  ),
                  validator: (value) =>
                      value == null || value.isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _targetAudience,
                  decoration: const InputDecoration(
                    hintText: 'Target Audience',
                    prefixIcon: Icon(LucideIcons.users, size: 20),
                  ),
                  items: _audiences
                      .map(
                        (aud) => DropdownMenuItem(value: aud, child: Text(aud)),
                      )
                      .toList(),
                  onChanged: (val) => setState(() => _targetAudience = val!),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _messageController,
                  maxLines: 6,
                  decoration: const InputDecoration(
                    hintText: 'Type your message here...',
                    alignLabelWithHint: true,
                    prefixIcon: Padding(
                      padding: EdgeInsets.only(bottom: 100), // Align top
                      child: Icon(LucideIcons.alignLeft, size: 20),
                    ),
                  ),
                  validator: (value) =>
                      value == null || value.isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 24),
                const Text(
                  'Delivery Channels',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: Colors.black.withValues(alpha: 0.05),
                    ),
                  ),
                  child: Column(
                    children: [
                      SwitchListTile(
                        title: const Text(
                          'Push Notification',
                          style: TextStyle(fontWeight: FontWeight.w500),
                        ),
                        subtitle: const Text('Send instantly to mobile apps'),
                        value: _sendPush,
                        onChanged: (val) => setState(() => _sendPush = val),
                        activeThumbColor: AppColors.primary,
                      ),
                      Divider(
                        height: 1,
                        color: Colors.black.withValues(alpha: 0.05),
                      ),
                      SwitchListTile(
                        title: const Text(
                          'SMS Delivery',
                          style: TextStyle(fontWeight: FontWeight.w500),
                        ),
                        subtitle: const Text(
                          'Additional carrier charges may apply',
                        ),
                        value: _sendSms,
                        onChanged: (val) => setState(() => _sendSms = val),
                        activeThumbColor: AppColors.primary,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 40),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    icon: const Icon(LucideIcons.send),
                    label: const Text('Publish Notice'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    onPressed: () {
                      if (_formKey.currentState!.validate()) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Notice published successfully!'),
                            backgroundColor: AppColors.primary,
                          ),
                        );
                        Navigator.pop(context);
                      }
                    },
                  ),
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
