"""Global template context processors."""
from django.conf import settings
from .models import Hospital


def hospital_context(request):
    """Inject hospital info into every template."""
    hospital = None
    if request.user.is_authenticated and hasattr(request.user, 'hospital') and request.user.hospital:
        hospital = request.user.hospital
    else:
        hospital = Hospital.objects.filter(is_active=True).first()

    return {
        'hospital': hospital,
        'hospital_name': hospital.name if hospital else settings.HOSPITAL_NAME,
        'hospital_logo': hospital.logo.url if (hospital and hospital.logo) else None,
        'hospital_address': hospital.address if hospital else settings.HOSPITAL_ADDRESS,
    }


def system_context(request):
    """Inject system-wide constants."""
    return {
        'system_version': settings.SYSTEM_VERSION,
        'system_name': 'JORINOVA NEXUS ALIS-X',
        'system_tagline': 'Smart data. Safer health.',
    }
