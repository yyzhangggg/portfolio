# Hand-written; see the note in 0001_initial.py.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("gallery", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="album",
            name="architect",
            field=models.CharField(blank=True, help_text="Architect or practice.", max_length=200),
        ),
        migrations.AddField(
            model_name="album",
            name="location",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="album",
            name="grid_ratio",
            field=models.CharField(
                choices=[("3:4", "3:4 portrait"), ("4:3", "4:3 landscape"), ("16:9", "16:9 wide"), ("9:16", "9:16 tall")],
                default="4:3",
                help_text="Shape of the cells on the series page. Photos are never cropped to fit.",
                max_length=5,
            ),
        ),
        migrations.AddField(
            model_name="photo",
            name="crop",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="photo",
            name="grid_variants",
            field=models.JSONField(blank=True, default=dict, help_text="Cropped variants, when cropped."),
        ),
        migrations.AlterField(
            model_name="homepagesettings",
            name="headline",
            field=models.CharField(default="Architecture photography", max_length=200),
        ),
    ]
