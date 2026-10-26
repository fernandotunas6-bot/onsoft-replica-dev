import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';

/// Modo SIGA: a gestão da escola (alunos, professores, turmas, propinas,
/// calendário, pautas) faz-se no portal do SIGA. A app mostra onde.
class SgaPortalScreen extends StatelessWidget {
  const SgaPortalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final url = SgaConfig.fromEnvironment.portalUrl;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Portal do SIGA',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: ListView(
        padding: getResponsiveHorizontalPadding(
          context,
        ).copyWith(top: 16, bottom: 40),
        children: [
          SoftCard(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                IconTile(
                  icon: LucideIcons.building2,
                  color: AppColors.primary,
                  size: 44,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    'Alunos, professores, turmas, propinas, calendário e pautas '
                    'geram-se no portal do SIGA, onde está toda a gestão da escola. '
                    'Na app ficam a chamada, as notas, as faltas, os comunicados e '
                    'as mensagens.',
                    style: TextStyle(
                      fontSize: 14,
                      color: AppColors.textPrimary,
                      height: 1.45,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (url.isNotEmpty) ...[
            const SizedBox(height: 16),
            SoftCard(
              onTap: () {
                Clipboard.setData(ClipboardData(text: url));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Endereço copiado.')),
                );
              },
              child: Row(
                children: [
                  Icon(
                    LucideIcons.link,
                    size: 20,
                    color: AppColors.textSecondary,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SelectableText(
                      url,
                      style: TextStyle(fontSize: 15, color: AppColors.primary),
                    ),
                  ),
                  Icon(
                    LucideIcons.copy,
                    size: 18,
                    color: AppColors.textSecondary,
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
