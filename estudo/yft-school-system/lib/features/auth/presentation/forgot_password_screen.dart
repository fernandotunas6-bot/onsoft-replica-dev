import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/responsive_utils.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _usernameController = TextEditingController();
  bool _isLoading = false;
  bool _showAdminContact = false;

  @override
  void dispose() {
    _usernameController.dispose();
    super.dispose();
  }

  Future<void> _handleSendResetLink() async {
    if (_usernameController.text.trim().isEmpty ||
        !_usernameController.text.contains('@')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid email address')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
      _showAdminContact = false;
    });

    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(
        email: _usernameController.text.trim(),
      );
      if (mounted) {
        setState(() {
          _isLoading = false;
          _showAdminContact = true;
        });
      }
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? 'Failed to send reset email')),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Connection error. Please try again.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = getScreenSize(context) == ScreenSize.desktop;

    if (isDesktop) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Row(
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  border: Border(
                    right: BorderSide(
                      color: Colors.black.withValues(alpha: 0.05),
                    ),
                  ),
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          LucideIcons.mail,
                          size: 100,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(height: 48),
                      Text(
                        'Reset Your Password',
                        style: Theme.of(context).textTheme.displayLarge
                            ?.copyWith(
                              fontSize: 32,
                              color: AppColors.secondary,
                            ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Enter your registered email address to receive a secure link to reset your password.',
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(fontSize: 16),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 48,
                    vertical: 24,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: _buildFormContent(),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    // Mobile/Tablet Layout
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, color: AppColors.textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: getResponsiveHorizontalPadding(context),
          child: ResponsiveConstrainedContent(child: _buildFormContent()),
        ),
      ),
    );
  }

  Widget _buildFormContent() {
    final isDesktop = getScreenSize(context) == ScreenSize.desktop;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (isDesktop) ...[
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              icon: const Icon(
                LucideIcons.arrowLeft,
                color: AppColors.textPrimary,
              ),
              onPressed: () => Navigator.pop(context),
              tooltip: 'Back to Login',
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Header Title
        Text(
          'Forgot Password',
          style: Theme.of(context).textTheme.displayLarge?.copyWith(
            fontSize: 32,
            color: AppColors.secondary,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Enter your registered email address and we will send you a secure link to reset your password.',
          style: Theme.of(context).textTheme.bodyMedium,
          textAlign: TextAlign.center,
        ),

        const SizedBox(height: 48),

        if (!_showAdminContact) ...[
          // Search Form
          TextField(
            controller: _usernameController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              hintText: 'Enter your email address',
              prefixIcon: Icon(LucideIcons.mail, size: 20),
            ),
            onSubmitted: (_) => _handleSendResetLink(),
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _handleSendResetLink,
              child: _isLoading
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Send Reset Link',
                      style: TextStyle(fontSize: 16),
                    ),
            ),
          ),
        ] else ...[
          // Success Result
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.green.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: const BoxDecoration(
                        color: Colors.green,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        LucideIcons.mailCheck,
                        color: Colors.white,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 16),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Recovery Email Sent',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 18,
                              color: Colors.green,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Check your inbox for a reset link',
                            style: TextStyle(
                              color: AppColors.textSecondary,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text(
                  'We have sent an email to ${_usernameController.text} with instructions to safely reset your password. It may take a few minutes to arrive.',
                  style: const TextStyle(fontSize: 14, height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: OutlinedButton.icon(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(LucideIcons.arrowLeft, size: 20),
              label: const Text('Back to Login'),
            ),
          ),
        ],

        const SizedBox(height: 40),
      ],
    );
  }
}
