<?php
/**
 * Plugin Name: AetherPress Intelligence Migration
 * Description: Migrates the AetherHost-managed installation to the standard plugins list.
 */
defined('ABSPATH') || exit;

// Keep the existing functionality available until WordPress activates the
// regular plugin. Once migrated, this loader respects normal deactivation.
if (get_option('aetherpress_intelligence_standard_migrated') !== '1') {
    $plugin = WP_PLUGIN_DIR . '/aetherpress-intelligence/aetherpress-intelligence.php';
    if (is_readable($plugin)) {
        require_once $plugin;
        add_action('admin_init', function () {
            if (!current_user_can('activate_plugins')) return;
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
            $result = activate_plugin('aetherpress-intelligence/aetherpress-intelligence.php', '', false, true);
            if (!is_wp_error($result)) update_option('aetherpress_intelligence_standard_migrated', '1', false);
        });
    }
}
